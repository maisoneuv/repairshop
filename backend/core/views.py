from datetime import timedelta
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.hashers import make_password, check_password
from django.db import models as db_models
from django.http import JsonResponse
from django.utils import timezone
from django.shortcuts import render
from django.views.generic import ListView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated, IsAdminUser
from rest_framework import viewsets, status
from django.contrib.contenttypes.models import ContentType
from rest_framework.response import Response
from rest_framework.views import APIView
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.decorators import action

from .models import Note, User, Permission, RolePermission, UserRole, Role, PicklistValue, Setting
from .serializers import (NoteSerializer, UserSerializer, PermissionSerializer,
                          RolePermissionSerializer, RoleSerializer, UserRoleSerializer,
                          UserRoleCreateSerializer, MyPermissionsResponseSerializer,
                          SettingSerializer, SettingWriteSerializer)
from .utils import create_system_note
from tenants.managers import TenantAwareManager
from .permissions import TenantUserMatchesRequestTenant

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
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, TenantUserMatchesRequestTenant]

    def get_queryset(self):
        # Only users belonging to this tenant
        return User.objects.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        # Force assign the tenant of the request
        serializer.save(tenant=self.request.tenant)

class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated]

class RoleViewSet(viewsets.ModelViewSet):
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, TenantUserMatchesRequestTenant]

    def get_queryset(self):
        return Role.objects.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

class RolePermissionViewSet(viewsets.ModelViewSet):
    serializer_class = RolePermissionSerializer
    permission_classes = [IsAuthenticated, TenantUserMatchesRequestTenant]

    def get_queryset(self):
        return RolePermission.objects.filter(role__tenant=self.request.tenant)

class UserRoleViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, TenantUserMatchesRequestTenant]

    def get_queryset(self):
        return UserRole.objects.filter(role__tenant=self.request.tenant)

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return UserRoleCreateSerializer
        return UserRoleSerializer

    def perform_create(self, serializer):
        role = serializer.validated_data['role']
        if role.tenant != self.request.tenant:
            raise PermissionDenied("Role not in current tenant.")
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
            {'value': v.value, 'name': v.name, 'color': v.color}
            for v in values
        ])
