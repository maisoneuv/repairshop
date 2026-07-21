"""Photo attachment endpoints.

Photos attach to any tenant-scoped object via a generic FK, mirroring
NoteViewSet's model+obj_id addressing. Two upload paths share one ingest
pipeline (core.image_utils):
  - desktop: authenticated staff POST multipart to photos/<model>/<obj_id>/
  - mobile:  a phone POSTs with a short-lived PhotoUploadLink token (no session)

Files are served through authenticated, tenant-checked views — never raw
MEDIA_URL — so a guessed media path can't cross tenants.

These APIViews carry no queryset, so they can't use TenantScopedMixin; each
one constrains every ORM access to request.tenant (or, for the mobile path,
to the token's tenant) and is listed in tenants/test_route_coverage.py.
"""
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from datetime import timedelta

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .authentication import resolve_upload_link
from .image_utils import process_upload, InvalidImageError
from .models import Photo, PhotoUploadLink
from .serializers import PhotoSerializer

# Which models a photo may attach to, and how to reach the tenant from each.
# Asset has no direct tenant field — it's scoped through its customer.
PHOTO_ATTACHABLE_MODELS = {
    'workitem': 'tenant',
    'task': 'tenant',
    'asset': 'customer__tenant',
}

UPLOAD_LINK_TTL = timedelta(minutes=30)
MAX_FILES_PER_REQUEST = 20


def _frontend_url(request, path):
    """Build an absolute URL to a frontend (SPA) route.

    The mobile upload page is a React route served by the frontend, which in dev
    is a different origin (Vite :5173) than the API (Django :8000). Prefer the
    request's Origin header — that's the frontend the staff user is actually on,
    and where the phone/incognito tab must land — over build_absolute_uri, which
    would return the API host and be unreachable in split-origin dev.
    """
    origin = request.META.get('HTTP_ORIGIN')
    if origin:
        return f"{origin.rstrip('/')}{path}"
    return request.build_absolute_uri(path)


def _resolve_parent(model, obj_id, tenant):
    """Return the ContentType for a photo's parent, enforcing that the model is
    attachable and the object belongs to `tenant`. Raises Http404 otherwise so
    cross-tenant IDs are indistinguishable from nonexistent ones.
    """
    tenant_path = PHOTO_ATTACHABLE_MODELS.get(model)
    if tenant_path is None or tenant is None:
        raise Http404("Not found.")

    content_type = ContentType.objects.get(model=model)
    model_class = content_type.model_class()
    if model_class is None:
        raise Http404("Not found.")

    if not model_class.objects.filter(**{'pk': obj_id, tenant_path: tenant}).exists():
        raise Http404("Not found.")
    return content_type


def _ingest_files(files, *, tenant, content_type, object_id, uploaded_by,
                  uploaded_via, upload_link=None):
    """Validate + normalize each file and create Photo rows in one transaction.

    Returns (created_photos, errors). Persist happens atomically; a bad file is
    reported per-file rather than failing the whole batch.
    """
    created, errors = [], []
    with transaction.atomic():
        for f in files:
            try:
                processed = process_upload(f)
            except InvalidImageError as exc:
                errors.append({'filename': getattr(f, 'name', ''), 'error': str(exc)})
                continue

            photo = Photo(
                tenant=tenant,
                content_type=content_type,
                object_id=object_id,
                filename=getattr(f, 'name', 'photo.jpg')[:255],
                mime_type=processed['mime_type'],
                size=processed['size'],
                width=processed['width'],
                height=processed['height'],
                uploaded_by=uploaded_by,
                uploaded_via=uploaded_via,
                upload_link=upload_link,
            )
            photo.image.save(processed['image'].name, processed['image'], save=False)
            photo.thumbnail.save(processed['thumbnail'].name, processed['thumbnail'], save=False)
            photo.save()
            created.append(photo)
    return created, errors


class PhotoListCreateView(APIView):
    """GET list / POST upload photos for one parent object (desktop path)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, model, obj_id):
        content_type = _resolve_parent(model, obj_id, request.tenant)
        photos = Photo.objects.filter(
            tenant=request.tenant,
            content_type=content_type,
            object_id=obj_id,
            deleted_at__isnull=True,
        )
        return Response(PhotoSerializer(photos, many=True, context={'request': request}).data)

    def post(self, request, model, obj_id):
        content_type = _resolve_parent(model, obj_id, request.tenant)
        files = request.FILES.getlist('images') or request.FILES.getlist('image')
        if not files:
            return Response({'error': 'No image files provided.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(files) > MAX_FILES_PER_REQUEST:
            return Response({'error': f'At most {MAX_FILES_PER_REQUEST} photos per request.'},
                            status=status.HTTP_400_BAD_REQUEST)

        category = (request.data.get('category') or 'other').strip()
        created, errors = _ingest_files(
            files, tenant=request.tenant, content_type=content_type, object_id=obj_id,
            uploaded_by=request.user, uploaded_via='web',
        )
        if category in dict(Photo.CATEGORY_CHOICES) and created:
            for p in created:
                p.category = category
            Photo.objects.bulk_update(created, ['category'])

        return Response(
            {
                'photos': PhotoSerializer(created, many=True, context={'request': request}).data,
                'errors': errors,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )


class PhotoDetailView(APIView):
    """Soft-delete a photo. Never a hard delete — intake photos are evidence."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            photo = Photo.objects.get(pk=pk, tenant=request.tenant, deleted_at__isnull=True)
        except Photo.DoesNotExist:
            raise Http404("Not found.")
        photo.deleted_at = timezone.now()
        photo.save(update_fields=['deleted_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PhotoFileView(APIView):
    """Stream a photo's full image or thumbnail, checking tenant ownership.

    `which` is 'file' or 'thumb'. Serving through this view (not MEDIA_URL) is
    what makes storage-path guessing across tenants impossible.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, which='file'):
        qs = Photo.objects.filter(pk=pk, deleted_at__isnull=True)
        # Superusers may view across tenants only when no tenant is switched in.
        if request.tenant is not None:
            qs = qs.filter(tenant=request.tenant)
        elif not (request.user.is_authenticated and request.user.is_superuser):
            raise Http404("Not found.")

        photo = qs.first()
        if photo is None:
            raise Http404("Not found.")

        field = photo.thumbnail if (which == 'thumb' and photo.thumbnail) else photo.image
        if not field:
            raise Http404("Not found.")
        response = FileResponse(field.open('rb'), content_type=photo.mime_type or 'image/jpeg')
        # Photos are immutable (no edit-in-place), so let the browser cache them
        # to avoid re-fetching every thumbnail on each gallery render. Private:
        # they're tenant-scoped and access-controlled, never shared caches.
        response['Cache-Control'] = 'private, max-age=86400'
        return response


class PhotoUploadLinkCreateView(APIView):
    """Create a short-lived QR upload link for one object (desktop → phone)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        model = (request.data.get('model') or '').strip()
        obj_id = request.data.get('object_id')
        if not model or not obj_id:
            return Response({'error': 'model and object_id are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        content_type = _resolve_parent(model, obj_id, request.tenant)

        plaintext, prefix, token_hash = PhotoUploadLink.generate_token()
        link = PhotoUploadLink.objects.create(
            tenant=request.tenant,
            content_type=content_type,
            object_id=obj_id,
            token_hash=token_hash,
            prefix=prefix,
            created_by=request.user,
            expires_at=timezone.now() + UPLOAD_LINK_TTL,
        )

        # Plaintext token is returned exactly once; only its hash is stored.
        upload_path = f"/m/upload/{plaintext}"
        return Response(
            {
                'id': link.id,
                'token': plaintext,
                'upload_path': upload_path,
                'upload_url': _frontend_url(request, upload_path),
                'expires_at': link.expires_at,
            },
            status=status.HTTP_201_CREATED,
        )


class MobilePhotoUploadView(APIView):
    """Token-gated upload endpoint hit by the phone. AllowAny: the URL token is
    the sole authorization and grants access to exactly one object.
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # no session/CSRF — the token is the credential

    def get(self, request, token):
        """Lightweight context for the mobile page (what am I uploading to?)."""
        link = resolve_upload_link(token)
        if link is None:
            raise Http404("This upload link is invalid or has expired.")
        parent = link.content_object
        label = getattr(parent, 'reference_id', None) or str(parent) if parent else None
        return Response({
            'valid': True,
            'target': link.content_type.model,
            'target_label': label,
            'expires_at': link.expires_at,
        })

    def post(self, request, token):
        link = resolve_upload_link(token)
        if link is None:
            raise Http404("This upload link is invalid or has expired.")

        files = request.FILES.getlist('images') or request.FILES.getlist('image')
        if not files:
            return Response({'error': 'No image files provided.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(files) > MAX_FILES_PER_REQUEST:
            return Response({'error': f'At most {MAX_FILES_PER_REQUEST} photos per request.'},
                            status=status.HTTP_400_BAD_REQUEST)

        created, errors = _ingest_files(
            files, tenant=link.tenant, content_type=link.content_type,
            object_id=link.object_id, uploaded_by=link.created_by,
            uploaded_via='mobile_link', upload_link=link,
        )
        if created:
            PhotoUploadLink.objects.filter(pk=link.pk).update(used_count=link.used_count + len(created))

        return Response(
            {'uploaded': len(created), 'errors': errors},
            status=status.HTTP_201_CREATED if created else status.HTTP_400_BAD_REQUEST,
        )
