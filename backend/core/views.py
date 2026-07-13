from datetime import timedelta
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.conf import settings as django_settings
from django.db import models as db_models
from django.http import JsonResponse
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.shortcuts import render
from django.views.generic import ListView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated, IsAdminUser, AllowAny
from rest_framework import viewsets, status
from django.contrib.contenttypes.models import ContentType
from rest_framework.response import Response
from rest_framework.views import APIView
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.decorators import action

import logging
from .email_utils import send_system_email

logger = logging.getLogger(__name__)
from .models import Note, User, Permission, RolePermission, UserRole, Role, PicklistValue, Setting, CustomField, EmailMessage, EmailAttachment, EmailTemplate
from .serializers import (NoteSerializer, UserSerializer, UserCreateSerializer, PermissionSerializer,
                          RolePermissionSerializer, RoleSerializer, UserRoleSerializer,
                          UserRoleCreateSerializer, MyPermissionsResponseSerializer,
                          SettingSerializer, SettingWriteSerializer,
                          PicklistValueAdminSerializer, CustomFieldSerializer,
                          EmailMessageSerializer, EmailTemplateSerializer)
from .utils import create_system_note
from tenants.managers import TenantAwareManager
from tenants.models import TenantEmailSettings
from .permissions import TenantUserMatchesRequestTenant, ManageUsersPermission

INCLUDED_APP_LABELS = {
    "customers", "tasks", "service", "documents",
    "inventory", "integrations", "core", "calls",
}


def _send_password_reset_email(user, request=None):
    """Generate a password reset token and send it to the user by email."""
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_base = getattr(django_settings, 'FRONTEND_BASE_URL', 'http://localhost:5173')
    reset_url = f"{frontend_base}/reset-password/{uid}/{token}/"

    is_new = not user.has_usable_password()
    subject = "Set up your account" if is_new else "Reset your password"
    greeting = user.name or user.first_name or user.email
    action_label = "Set your password" if is_new else "Reset your password"
    body = (
        f"Hi {greeting},\n\n"
        + ("Your account has been created. " if is_new else "")
        + f"Click the link below to {action_label.lower()}:\n\n"
        f"{reset_url}\n\n"
        "This link expires in 72 hours.\n"
    )

    send_system_email(subject, body, user.email)

    user.password_reset_sent_at = timezone.now()
    user.save(update_fields=['password_reset_sent_at'])

def home_view(request):
    return render(request, 'home.html')

def react_app_view(request):
    """Serve the React SPA for client-side routing"""
    return render(request, 'react_app.html')

class BaseListView(ListView):
    template_name = "layouts/generic_list.html"

    columns = []

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        object_list = context["object_list"]

        rows = []

        for obj in object_list:
            row_data = []
            for col in self.columns:

                field_value = None
                if col.get("field"):
                    field_value = self.get_nested_attr(obj, col["field"])

                url_param = None
                if col.get("is_link"):
                    param_name = col.get("url_field")
                    if param_name:
                        url_param = self.get_nested_attr(obj, param_name)

                display_text = field_value
                if col.get("display_field"):
                    display_text = self.get_nested_attr(obj, col["display_field"])
                elif col.get("constant_text"):
                    display_text = col["constant_text"]

                row_data.append({
                    "column": col,
                    "object": obj,
                    "value": field_value,
                    "url_param": url_param,
                    "display_text": display_text
                })
            rows.append(row_data)

        context["columns"] = self.columns
        context["rows"] = rows

        return context


    def get_nested_attr(self, obj, field_path):
        parts = field_path.split(".")  # e.g. ["inventory_item", "name"]
        for part in parts:
            print(f"part: {part}")
            print(f"obj: {obj}")
            if obj is None:
                return None
            obj = getattr(obj, part, None)  # e.g. obj = obj.inventory_item, then obj = obj.name
        return obj


class GenericSearchView(ListAPIView):
    """
    A generic search view that takes:
      - `queryset`
      - `serializer_class`
      - `search_fields` (defined on the class)
    Example:
      class CustomerSearchView(GenericSearchView):
          queryset = Customer.objects.all()
          serializer_class = CustomerSerializer
          search_fields = ['first_name', 'last_name', 'email']
    """
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [SearchFilter]
    search_fields = []

class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer

    def get_queryset(self):
        model = self.kwargs["model"]
        obj_id = self.kwargs["obj_id"]
        content_type = ContentType.objects.get(model=model)

        # Get notes for the current object
        notes = Note.objects.filter(content_type=content_type, object_id=obj_id)

        # If this is a work item, also include notes from related tasks
        if model == "workitem":
            from tasks.models import Task
            task_content_type = ContentType.objects.get_for_model(Task)

            # Get all tasks related to this work item
            task_ids = Task.objects.filter(work_item_id=obj_id).values_list('id', flat=True)

            # Get notes from those tasks
            task_notes = Note.objects.filter(
                content_type=task_content_type,
                object_id__in=task_ids
            )

            # Combine both querysets
            notes = notes | task_notes

        return notes.distinct()

    def perform_create(self, serializer):
        model = self.kwargs["model"]
        obj_id = self.kwargs["obj_id"]
        content_type = ContentType.objects.get(model=model)
        print(f'user:{self.request.user}')
        serializer.save(author=self.request.user, content_type=content_type, object_id=obj_id)

    def perform_update(self, serializer):
        old_instance = self.get_object()
        new_instance = serializer.save()

        # Compare old vs new status
        if old_instance.status != new_instance.status:
            create_system_note(
                new_instance,
                f"Status changed from '{old_instance.status}' to '{new_instance.status}'"
            )


class UserViewSet(viewsets.ModelViewSet):
    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), ManageUsersPermission()]
        return [IsAuthenticated(), TenantUserMatchesRequestTenant()]

    def get_queryset(self):
        return User.objects.filter(
            tenant=self.request.tenant,
            is_superuser=False,
            is_staff=False,
        )

    def perform_create(self, serializer):
        user = serializer.save(tenant=self.request.tenant, created_by=self.request.user)
        user.set_unusable_password()
        user.save(update_fields=['password'])
        try:
            _send_password_reset_email(user)
        except Exception:
            pass  # email failure should not block user creation

    def destroy(self, _request, *_args, **_kwargs):
        return Response(
            {'detail': 'Deleting users is not allowed. Deactivate them instead.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class TriggerPasswordResetView(APIView):
    permission_classes = [IsAuthenticated, ManageUsersPermission]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk, tenant=request.tenant, is_superuser=False, is_staff=False)
        except User.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if user.password_reset_sent_at:
            elapsed = (timezone.now() - user.password_reset_sent_at).total_seconds()
            if elapsed < 60:
                return Response(
                    {'detail': 'Please wait before requesting another reset.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        try:
            _send_password_reset_email(user)
        except Exception as exc:
            return Response({'detail': f'Failed to send email: {exc}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({'sent': True})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        uid = request.data.get('uid', '')
        token = request.data.get('token', '')
        new_password = request.data.get('new_password', '')

        if not uid or not token or not new_password:
            return Response({'detail': 'uid, token, and new_password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_pk = urlsafe_base64_decode(uid).decode()
            user = User.objects.get(pk=user_pk)
        except (ValueError, TypeError, User.DoesNotExist):
            return Response({'detail': 'Invalid link.'}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({'detail': 'Invalid or expired link.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            return Response({'detail': exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=['password'])

        return Response({'success': True})


def _email_settings_payload(obj):
    """Serialize TenantEmailSettings for the settings UI."""
    slug = obj.sending_slug or obj.tenant.subdomain
    return {
        'from_name': obj.from_name,
        'from_email': obj.from_email,
        'sending_slug': slug,
        'default_from_address': f"{slug}@{django_settings.PLATFORM_EMAIL_DOMAIN}",
        'reply_forward_email': obj.reply_forward_email,
        'custom_domain': obj.custom_domain,
        'domain_status': obj.domain_status,
        'dns_records': obj.dns_records,
        'domain_verified_at': obj.domain_verified_at,
    }


def _get_or_create_email_settings(tenant):
    obj, created = TenantEmailSettings.objects.get_or_create(tenant=tenant)
    if created or not obj.sending_slug:
        obj.sending_slug = tenant.subdomain
        obj.save(update_fields=['sending_slug'])
    return obj


class TenantEmailSettingsView(APIView):
    permission_classes = [IsAuthenticated, ManageUsersPermission]

    def get(self, request):
        obj = _get_or_create_email_settings(request.tenant)
        return Response(_email_settings_payload(obj))

    def patch(self, request):
        obj = _get_or_create_email_settings(request.tenant)

        if 'from_name' in request.data:
            obj.from_name = request.data.get('from_name') or ''

        if 'reply_forward_email' in request.data:
            obj.reply_forward_email = (request.data.get('reply_forward_email') or '').strip()

        if 'sending_slug' in request.data:
            from django.core.validators import validate_slug
            new_slug = (request.data.get('sending_slug') or '').strip().lower()
            if not new_slug:
                return Response({'detail': 'sending_slug cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                validate_slug(new_slug)
            except DjangoValidationError:
                return Response({'detail': 'sending_slug may only contain letters, numbers, hyphens and underscores.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if TenantEmailSettings.objects.exclude(pk=obj.pk).filter(sending_slug=new_slug).exists():
                return Response({'detail': 'This sending address is already taken.'}, status=status.HTTP_400_BAD_REQUEST)
            obj.sending_slug = new_slug

        if 'from_email' in request.data:
            new_email = (request.data.get('from_email') or '').strip()
            if new_email:
                if obj.domain_status != 'verified':
                    return Response(
                        {'detail': 'Verify your custom domain before setting a custom From address.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if new_email.rsplit('@', 1)[-1].lower() != obj.custom_domain.lower():
                    return Response(
                        {'detail': f'From address must be on your verified domain ({obj.custom_domain}).'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            obj.from_email = new_email

        obj.save()
        return Response(_email_settings_payload(obj))


class TenantEmailDomainView(APIView):
    """Custom sending-domain wizard backed by the Resend Domains API."""
    permission_classes = [IsAuthenticated, ManageUsersPermission]

    def post(self, request):
        from tenants.resend_domains import ResendDomainError, create_domain

        obj = _get_or_create_email_settings(request.tenant)
        if obj.resend_domain_id:
            return Response({'detail': 'A domain is already configured. Remove it first.'},
                            status=status.HTTP_400_BAD_REQUEST)

        domain = (request.data.get('domain') or '').strip().lower().rstrip('.')
        import re as _re
        if not _re.fullmatch(r'(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}', domain):
            return Response({'detail': 'Enter a valid domain name (e.g. repairhero.com).'},
                            status=status.HTTP_400_BAD_REQUEST)
        if TenantEmailSettings.objects.exclude(pk=obj.pk).filter(custom_domain=domain).exists():
            return Response({'detail': 'This domain is already registered by another account.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            result = create_domain(domain)
        except ResendDomainError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        obj.custom_domain = domain
        obj.resend_domain_id = result.get('id', '')
        obj.dns_records = result.get('records', [])
        obj.domain_status = 'pending'
        obj.domain_verified_at = None
        obj.save()
        return Response(_email_settings_payload(obj), status=status.HTTP_201_CREATED)

    def get(self, request):
        obj = _get_or_create_email_settings(request.tenant)
        if obj.resend_domain_id:
            from tenants.resend_domains import ResendDomainError, get_domain
            try:
                result = get_domain(obj.resend_domain_id)
            except ResendDomainError as exc:
                logger.warning("Resend get_domain failed for tenant %s: %s", request.tenant.pk, exc)
            else:
                self._apply_domain_result(obj, result)
        return Response(_email_settings_payload(obj))

    def post_verify(self, request):
        from tenants.resend_domains import ResendDomainError, get_domain, verify_domain

        obj = _get_or_create_email_settings(request.tenant)
        if not obj.resend_domain_id:
            return Response({'detail': 'No domain configured.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            verify_domain(obj.resend_domain_id)
            result = get_domain(obj.resend_domain_id)
        except ResendDomainError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        self._apply_domain_result(obj, result)
        return Response(_email_settings_payload(obj))

    def delete(self, request):
        from tenants.resend_domains import ResendDomainError, delete_domain

        obj = _get_or_create_email_settings(request.tenant)
        if obj.resend_domain_id:
            try:
                delete_domain(obj.resend_domain_id)
            except ResendDomainError as exc:
                # Best effort — clear our side regardless so the tenant isn't stuck.
                logger.warning("Resend delete_domain failed for tenant %s: %s", request.tenant.pk, exc)

        obj.custom_domain = ''
        obj.resend_domain_id = ''
        obj.dns_records = []
        obj.domain_status = 'none'
        obj.domain_verified_at = None
        obj.from_email = ''  # was only valid on the removed domain
        obj.save()
        return Response(_email_settings_payload(obj))

    @staticmethod
    def _apply_domain_result(obj, result):
        resend_status = result.get('status', '')
        obj.dns_records = result.get('records', obj.dns_records)
        if resend_status == 'verified':
            if obj.domain_status != 'verified':
                obj.domain_verified_at = timezone.now()
            obj.domain_status = 'verified'
        elif resend_status in ('failed', 'temporary_failure'):
            obj.domain_status = 'failed'
        else:  # not_started / pending
            obj.domain_status = 'pending'
        obj.save()


class TenantEmailDomainVerifyView(APIView):
    permission_classes = [IsAuthenticated, ManageUsersPermission]

    def post(self, request):
        return TenantEmailDomainView().post_verify(request)


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Permission.objects.filter(content_type__app_label__in=INCLUDED_APP_LABELS)


class RoleViewSet(viewsets.ModelViewSet):
    serializer_class = RoleSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), ManageUsersPermission()]
        return [IsAuthenticated(), TenantUserMatchesRequestTenant()]

    def get_queryset(self):
        return Role.objects.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def perform_destroy(self, instance):
        if instance.name == 'Tenant Admin':
            raise ValidationError('The Tenant Admin role cannot be deleted.')
        instance.delete()


class RolePermissionViewSet(viewsets.ModelViewSet):
    serializer_class = RolePermissionSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), ManageUsersPermission()]
        return [IsAuthenticated(), TenantUserMatchesRequestTenant()]

    def get_queryset(self):
        return RolePermission.objects.filter(role__tenant=self.request.tenant)

    def perform_create(self, serializer):
        role = serializer.validated_data['permission'].content_type.app_label
        if role not in INCLUDED_APP_LABELS:
            raise ValidationError('Permission from this app cannot be assigned via this API.')
        serializer.save()


class UserRoleViewSet(viewsets.ModelViewSet):
    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), ManageUsersPermission()]
        return [IsAuthenticated(), TenantUserMatchesRequestTenant()]

    def get_queryset(self):
        qs = UserRole.objects.filter(role__tenant=self.request.tenant)
        user_id = self.request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)
        return qs

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return UserRoleCreateSerializer
        return UserRoleSerializer

    def perform_create(self, serializer):
        role = serializer.validated_data['role']
        target_user = serializer.validated_data['user']
        if role.tenant != self.request.tenant:
            raise PermissionDenied("Role not in current tenant.")
        if target_user.tenant != self.request.tenant or target_user.is_superuser or target_user.is_staff:
            raise PermissionDenied("User not in current tenant.")
        serializer.save()

class MyPermissionsView(APIView):
    permission_classes = [IsAuthenticated, TenantUserMatchesRequestTenant]

    def get(self, request):
        user = request.user

        if user.is_superuser:
            # Superusers see *all* permissions
            permissions = Permission.objects.all().distinct()
        elif request.tenant:
            # Tenant-scoped user permissions
            permissions = Permission.objects.filter(
                rolepermission__role__user_roles__user=user,
                rolepermission__role__tenant=request.tenant
            ).distinct()
        else:
            raise PermissionDenied("Tenant not specified.")

        permissions_data = [{
            'permission_codename': p.codename,
            'permission_name': p.name,
            'content_type': str(p.content_type)
        } for p in permissions]

        result_data = {
            'is_superuser': user.is_superuser,
            'is_staff': user.is_staff,
            'permissions': permissions_data
        }

        serializer = MyPermissionsResponseSerializer(result_data)
        return Response(serializer.data)

@ensure_csrf_cookie
@api_view(['POST'])
def login_view(request):
    username = request.data.get('email')
    password = request.data.get('password')
    print(f'username:{username}')
    print(f'pass:{password}')

    user = authenticate(request, username=username, password=password)
    print(user)
    if user is not None:
        request_tenant = getattr(request, 'tenant', None)
        if request_tenant and user.tenant and user.tenant != request_tenant:
            return JsonResponse({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, user)
        user.last_full_login_at = timezone.now()
        user.save(update_fields=['last_full_login_at'])
        return JsonResponse({"success": True})
    return JsonResponse({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
def logout_view(request):
    logout(request)
    return JsonResponse({"success": True})


@api_view(['POST'])
@permission_classes([])
def quick_login_view(request):
    """Authenticate via user_id + PIN. Used by the lock screen."""
    user_id = request.data.get('user_id')
    pin = request.data.get('pin', '')

    if not user_id or not pin:
        return JsonResponse({"error": "user_id and pin required"}, status=status.HTTP_400_BAD_REQUEST)

    tenant = getattr(request, 'tenant', None)
    if not tenant:
        return JsonResponse({"error": "Tenant not resolved"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return JsonResponse({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    # Allow users in this tenant, or superusers with no tenant
    if user.tenant is not None and user.tenant != tenant:
        return JsonResponse({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    if not user.pin_hash or not check_password(pin, user.pin_hash):
        return JsonResponse({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)

    # If a session is already active (Fix 2: lockScreen no longer calls logout),
    # the session itself proves continuity — skip the inactivity check entirely.
    already_authed = request.user.is_authenticated

    if not already_authed:
        # No active session — require recent activity within the inactivity window.
        inactivity_limit = timedelta(hours=8)
        last_activity = user.last_activity_at

        if not last_activity or timezone.now() - last_activity > inactivity_limit:
            return JsonResponse({"error": "full_login_required"}, status=status.HTTP_403_FORBIDDEN)

    login(request, user)
    return JsonResponse({"success": True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def session_ping(request):
    """Lightweight endpoint for the frontend visibility handler to check session health.
    Returns 200 if the session is valid, 401 if not (handled by DRF automatically).
    The UpdateLastActivityMiddleware updates last_activity_at on this request."""
    return JsonResponse({"ok": True})


@api_view(['POST'])
def set_my_pin_view(request):
    """Set or clear the current user's PIN. Body: {pin: "1234"} or {pin: ""} to clear."""
    pin = request.data.get('pin', '')

    if pin and (not pin.isdigit() or not (4 <= len(pin) <= 6)):
        return JsonResponse({"error": "PIN must be 4–6 digits"}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    user.pin_hash = make_password(pin) if pin else ''
    user.save(update_fields=['pin_hash'])
    return JsonResponse({"success": True, "has_pin": bool(pin)})


@api_view(['POST'])
def set_user_pin_view(request, user_id):
    """Admin: set or clear PIN for any user in this tenant."""
    if not request.user.is_staff and not request.user.has_permission('manage_users', request.tenant):
        raise PermissionDenied("You do not have permission to manage user PINs.")

    tenant = getattr(request, 'tenant', None)
    if not tenant:
        return JsonResponse({"error": "Tenant not resolved"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    # Security: only allow setting PINs for users in this tenant, or superusers (tenant=null)
    if user.tenant is not None and user.tenant != tenant:
        return JsonResponse({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    pin = request.data.get('pin', '')
    if pin and (not pin.isdigit() or not (4 <= len(pin) <= 6)):
        return JsonResponse({"error": "PIN must be 4–6 digits"}, status=status.HTTP_400_BAD_REQUEST)

    user.pin_hash = make_password(pin) if pin else ''
    user.save(update_fields=['pin_hash'])
    return JsonResponse({"success": True, "has_pin": bool(pin)})


@api_view(['GET'])
@permission_classes([])
def list_pinned_users_view(request):
    """Return all active tenant users who have a PIN set (for lock screen tiles).
    Public endpoint — only exposes names/initials, no sensitive data.
    Requires tenant context (X-Tenant header or subdomain) but not authentication."""
    tenant = getattr(request, 'tenant', None)
    if not tenant:
        return JsonResponse({"error": "Tenant not resolved"}, status=status.HTTP_400_BAD_REQUEST)

    users = User.objects.filter(
        db_models.Q(tenant=tenant) | db_models.Q(tenant__isnull=True),
        is_active=True
    ).exclude(pin_hash='')

    def initials(user):
        parts = [user.first_name, user.last_name]
        result = ''.join(p[0].upper() for p in parts if p)
        return result or user.email[:2].upper()

    return JsonResponse({
        "users": [
            {"id": u.id, "name": u.name or f"{u.first_name} {u.last_name}".strip() or u.email, "initials": initials(u)}
            for u in users
        ]
    })


class GlobalSearchView(APIView):
    """
    Global search endpoint that searches across multiple models
    (Customers and Work Items) using PostgreSQL Full-Text Search.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        entity_types = request.query_params.get('entity_types', '').strip()

        # Minimum query length
        if len(query) < 2:
            return Response({
                'customers': [],
                'work_items': [],
                'total_count': 0,
                'query': query
            })

        # Get tenant from request
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response(
                {'detail': 'Tenant not resolved'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Parse entity types filter (comma-separated)
        enabled_types = set()
        if entity_types:
            enabled_types = set(entity_types.lower().split(','))
        else:
            # Default: search all entity types
            enabled_types = {'customers', 'work_items'}

        results = {
            'customers': [],
            'work_items': [],
            'total_count': 0,
            'query': query
        }

        # Search customers
        if 'customers' in enabled_types:
            from customers.services import search_customers, serialize_customer_search_result

            customers = search_customers(query, tenant, limit=5)
            results['customers'] = [
                serialize_customer_search_result(customer)
                for customer in customers
            ]

        # Search work items
        if 'work_items' in enabled_types:
            from tasks.services import search_work_items, serialize_work_item_search_result

            work_items = search_work_items(query, tenant, request.user, limit=5)
            results['work_items'] = [
                serialize_work_item_search_result(wi)
                for wi in work_items
            ]

        # Calculate total count
        results['total_count'] = len(results['customers']) + len(results['work_items'])

        return Response(results)


class SettingViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing custom settings.

    Endpoints:
    - GET /api/core/settings/ - List tenant settings (and globals if no tenant)
    - GET /api/core/settings/merged/ - Get all settings merged (global + tenant overrides)
    - GET /api/core/settings/{id}/ - Get specific setting
    - POST /api/core/settings/ - Create tenant-specific setting
    - PUT/PATCH /api/core/settings/{id}/ - Update setting
    - DELETE /api/core/settings/{id}/ - Delete tenant-specific setting
    - GET /api/core/settings/by-key/{key}/ - Get setting by key (merged)
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return SettingWriteSerializer
        return SettingSerializer

    def get_queryset(self):
        """
        Return settings visible to the current tenant.
        - Global settings (tenant=null)
        - Tenant-specific settings for current tenant
        """
        tenant = getattr(self.request, 'tenant', None)

        if tenant:
            # Return both global and tenant-specific
            return Setting.objects.filter(
                db_models.Q(tenant__isnull=True) | db_models.Q(tenant=tenant)
            ).select_related('tenant')
        else:
            # No tenant context - return only globals
            return Setting.objects.filter(tenant__isnull=True)

    def _require_manage_users(self, request):
        if not request.user.is_superuser and not request.user.has_permission('manage_users', request.tenant):
            raise PermissionDenied('You need the manage_users permission to modify settings.')

    def perform_create(self, serializer):
        """Create a tenant-specific setting."""
        tenant = getattr(self.request, 'tenant', None)
        if not tenant:
            raise PermissionDenied('Tenant context required to create settings.')
        self._require_manage_users(self.request)
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        """Only allow updating tenant-specific settings, not globals."""
        instance = self.get_object()
        tenant = getattr(self.request, 'tenant', None)

        if instance.tenant is None:
            raise PermissionDenied('Cannot modify global settings via API.')

        if tenant and instance.tenant_id != tenant.id:
            raise PermissionDenied('Cannot modify settings from another tenant.')

        self._require_manage_users(self.request)
        serializer.save()

    def perform_destroy(self, instance):
        """Only allow deleting tenant-specific settings."""
        if instance.tenant is None:
            raise PermissionDenied('Cannot delete global settings via API.')

        tenant = getattr(self.request, 'tenant', None)
        if tenant and instance.tenant_id != tenant.id:
            raise PermissionDenied('Cannot delete settings from another tenant.')

        self._require_manage_users(self.request)
        instance.delete()

    @action(detail=False, methods=['get'])
    def merged(self, request):
        """
        Get all settings merged for the current tenant.
        Global settings serve as defaults, tenant settings override.

        Response format:
        {
            "settings": {
                "setting_key": {
                    "value": <typed_value>,
                    "value_type": "string|numeric|boolean|date",
                    "is_override": true|false,
                    "description": "..."
                },
                ...
            }
        }
        """
        tenant = getattr(request, 'tenant', None)
        merged = Setting.get_all_merged(tenant)
        return Response({'settings': merged})

    @action(detail=False, methods=['get'], url_path='by-key/(?P<key>[^/.]+)')
    def by_key(self, request, key=None):
        """
        Get a specific setting by key, returning the merged value.

        Response format:
        {
            "key": "setting_key",
            "value": <typed_value>,
            "value_type": "string|numeric|boolean|date",
            "is_override": true|false,
            "description": "...",
            "found": true|false
        }
        """
        tenant = getattr(request, 'tenant', None)

        # Try tenant-specific first
        setting = None
        is_override = False

        if tenant:
            try:
                setting = Setting.objects.get(key=key, tenant=tenant)
                is_override = True
            except Setting.DoesNotExist:
                pass

        # Fall back to global
        if not setting:
            try:
                setting = Setting.objects.get(key=key, tenant__isnull=True)
            except Setting.DoesNotExist:
                return Response({
                    'key': key,
                    'value': None,
                    'value_type': None,
                    'is_override': False,
                    'description': None,
                    'found': False
                })

        return Response({
            'key': setting.key,
            'value': setting.value,
            'value_type': setting.value_type,
            'is_override': is_override,
            'description': setting.description,
            'found': True
        })
class PicklistValuesView(APIView):
    """
    Endpoint to fetch picklist values for a given category.
    Used for populating filter dropdowns.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, category):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response(
                {'detail': 'Tenant not resolved'},
                status=status.HTTP_400_BAD_REQUEST
            )

        values = PicklistValue.objects.filter(
            tenant=tenant,
            category=category,
            is_active=True
        ).order_by('sort_order', 'name')

        return Response([
            {
                'value': v.value,
                'name': v.name,
                'color': v.color,
                'status_role': v.status_role,
                'allowed_transitions': v.allowed_transitions,
            }
            for v in values
        ])


# Categories available for tenant self-service management.
# Tuple: (category_key, display_label, supports_status_role, supports_transitions)
CONFIGURABLE_CATEGORIES = [
    ('workitem_status',  'Work Item Status',   True,  True),
    ('task_status',      'Task Status',        True,  False),
    ('currency',         'Currency',           False, False),
    ('workitem_type',    'Repair Type',        False, False),
    ('workitem_priority','Priority',           False, False),
    ('intake_method',    'Intake Method',      False, False),
    ('dropoff_method',   'Drop-off Method',    False, False),
    ('payment_method',   'Payment Method',     False, False),
    ('employee_role',    'Employee Role',      False, False),
    ('referral_source',  'Referral Source',    False, False),
    ('lead_status',      'Lead Status',        True,  False),
]


class PicklistAdminViewSet(viewsets.ViewSet):
    """
    Tenant-facing admin API for managing picklist values.
    Supports listing, creating, updating, deleting, and reordering values,
    plus a categories meta-endpoint used to populate the settings UI.
    """
    permission_classes = [IsAuthenticated]

    def _get_tenant(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            raise PermissionDenied('Tenant not resolved.')
        return tenant

    @action(detail=False, methods=['get'], url_path='categories')
    def categories(self, request):
        """Return metadata for all configurable picklist categories."""
        return Response([
            {
                'key': key,
                'label': label,
                'supports_status_role': supports_role,
                'supports_transitions': supports_trans,
            }
            for key, label, supports_role, supports_trans in CONFIGURABLE_CATEGORIES
        ])

    def list(self, request):
        """
        Return all values for a category (including inactive).
        Pass ?category=workitem_status to filter.
        """
        tenant = self._get_tenant(request)
        category = request.query_params.get('category')
        qs = PicklistValue.objects.filter(tenant=tenant)
        if category:
            qs = qs.filter(category=category)
        qs = qs.order_by('category', 'sort_order', 'name')
        serializer = PicklistValueAdminSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        """Create a new tenant-defined picklist value."""
        tenant = self._get_tenant(request)
        category = request.data.get('category', '')
        allowed_keys = {c[0] for c in CONFIGURABLE_CATEGORIES}
        if category not in allowed_keys:
            return Response(
                {'category': f"'{category}' is not a configurable category."},
                status=status.HTTP_400_BAD_REQUEST
            )
        serializer = PicklistValueAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(tenant=tenant, is_system=False)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        """Update name, color, sort_order, is_active, allowed_transitions, status_role."""
        tenant = self._get_tenant(request)
        try:
            instance = PicklistValue.objects.get(pk=pk, tenant=tenant)
        except PicklistValue.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = PicklistValueAdminSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def destroy(self, request, pk=None):
        """
        Delete a picklist value.
        Blocked if: value is a system entry, or records still reference it.
        """
        tenant = self._get_tenant(request)
        try:
            instance = PicklistValue.objects.get(pk=pk, tenant=tenant)
        except PicklistValue.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if instance.is_system:
            return Response(
                {'detail': 'System values cannot be deleted. You can deactivate them instead.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        count = instance.usage_count()
        if count > 0:
            return Response(
                {'detail': f'This value is used by {count} record(s) and cannot be deleted. Deactivate it instead.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['post'], url_path='reorder')
    def reorder(self, request):
        """
        Bulk-update sort_order for a category.
        Body: {"category": "workitem_status", "ordered_ids": [3, 1, 2]}
        """
        tenant = self._get_tenant(request)
        category = request.data.get('category')
        ordered_ids = request.data.get('ordered_ids', [])
        if not category or not isinstance(ordered_ids, list):
            return Response(
                {'detail': 'category and ordered_ids are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        values = PicklistValue.objects.filter(tenant=tenant, category=category)
        id_set = {v.id for v in values}
        for position, pk in enumerate(ordered_ids):
            if pk in id_set:
                PicklistValue.objects.filter(pk=pk, tenant=tenant).update(sort_order=position)
        return Response({'detail': 'Reordered successfully.'})


class CustomFieldViewSet(viewsets.ModelViewSet):
    serializer_class = CustomFieldSerializer

    def _get_tenant(self, request):
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'X-Tenant header required.'})
        return tenant

    def get_queryset(self):
        tenant = getattr(self.request, 'tenant', None)
        if not tenant:
            return CustomField.objects.none()
        qs = CustomField.objects.filter(tenant=tenant)
        model_name = self.request.query_params.get('model_name')
        if model_name:
            qs = qs.filter(model_name=model_name)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('1', 'true', 'yes'))
        return qs

    def perform_create(self, serializer):
        tenant = self._get_tenant(self.request)
        if not self.request.user.has_permission('core.manage_custom_fields', tenant):
            raise PermissionDenied("You do not have permission to manage custom fields.")
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        tenant = self._get_tenant(self.request)
        if not self.request.user.has_permission('core.manage_custom_fields', tenant):
            raise PermissionDenied("You do not have permission to manage custom fields.")
        serializer.save()

    def perform_destroy(self, instance):
        tenant = self._get_tenant(self.request)
        if not self.request.user.has_permission('core.manage_custom_fields', tenant):
            raise PermissionDenied("You do not have permission to manage custom fields.")
        instance.is_active = False
        instance.save(update_fields=['is_active'])


class SendEmailView(APIView):
    """Persist the email + attachments, then enqueue delivery on Celery.

    The task retries transient provider failures with backoff; delivery/bounce
    status arrives later via the Resend tracking webhook.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.core.files.base import ContentFile
        from django.db import transaction
        from .email_utils import new_reply_token
        from .tasks import send_email_message

        tenant = request.tenant
        data = request.data

        to_email = data.get('to_email', '').strip()
        cc_raw = data.getlist('cc_emails') if hasattr(data, 'getlist') else (data.get('cc_emails') or [])
        if isinstance(cc_raw, str):
            cc_raw = [cc_raw]
        cc_emails = [e.strip() for e in cc_raw if e.strip()]
        subject = data.get('subject', '').strip()
        body_html = data.get('body_html', '')
        body_text = data.get('body_text', '').strip()
        model_name = data.get('model', '').strip()
        object_id = data.get('object_id')
        files = request.FILES.getlist('attachments')
        doc_ids_raw = data.getlist('document_ids') if hasattr(data, 'getlist') else (data.get('document_ids') or [])
        if isinstance(doc_ids_raw, str):
            doc_ids_raw = [doc_ids_raw]
        document_ids = []
        for d in doc_ids_raw:
            try:
                document_ids.append(int(d))
            except (ValueError, TypeError):
                pass

        if not to_email:
            return Response({'error': 'to_email is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not subject:
            return Response({'error': 'subject is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not model_name or not object_id:
            return Response({'error': 'model and object_id are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            content_type = ContentType.objects.get(model=model_name)
        except ContentType.DoesNotExist:
            return Response({'error': f'Unknown model: {model_name}'}, status=status.HTTP_400_BAD_REQUEST)

        # Load document attachments from work item form documents
        doc_attachment_data = []  # (filename, content) for creating EmailAttachment records
        if document_ids:
            import os
            from documents.models import FormDocument
            docs = FormDocument.objects.filter(
                id__in=document_ids,
                tenant=tenant,
                status=FormDocument.STATUS_SUCCESS,
            )
            for doc in docs:
                abs_path = os.path.join(django_settings.MEDIA_ROOT, doc.file_path)
                if os.path.exists(abs_path):
                    with open(abs_path, 'rb') as fobj:
                        content = fobj.read()
                    doc_attachment_data.append((os.path.basename(doc.file_path), content))

        # Persist everything first, then enqueue the send after commit so the
        # Celery worker (which shares the media volume) can read the attachments.
        with transaction.atomic():
            sent_email = EmailMessage.objects.create(
                tenant=tenant,
                author=request.user,
                direction='outbound',
                to_email=to_email,
                cc_emails=cc_emails,
                subject=subject,
                body_html=body_html,
                body_text=body_text,
                status='queued',
                reply_token=new_reply_token(),
                content_type=content_type,
                object_id=object_id,
            )

            for f in files:
                EmailAttachment.objects.create(
                    email=sent_email,
                    file=f,
                    filename=f.name,
                    mime_type=getattr(f, 'content_type', ''),
                    size=f.size,
                )

            for filename, content in doc_attachment_data:
                EmailAttachment.objects.create(
                    email=sent_email,
                    file=ContentFile(content, name=filename),
                    filename=filename,
                    mime_type='application/pdf',
                    size=len(content),
                )

            transaction.on_commit(lambda: send_email_message.delay(sent_email.id))

        return Response(
            EmailMessageSerializer(sent_email, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class EmailMessageListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, model, obj_id):
        try:
            content_type = ContentType.objects.get(model=model)
        except ContentType.DoesNotExist:
            return Response({'error': f'Unknown model: {model}'}, status=status.HTTP_400_BAD_REQUEST)

        emails = EmailMessage.objects.filter(
            tenant=request.tenant,
            content_type=content_type,
            object_id=obj_id,
        ).prefetch_related('attachments')
        return Response(EmailMessageSerializer(emails, many=True, context={'request': request}).data)


class EmailTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = EmailTemplateSerializer

    def get_queryset(self):
        return EmailTemplate.objects.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant, created_by=self.request.user)
