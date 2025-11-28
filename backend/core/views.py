from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.shortcuts import render
from django.views.generic import ListView
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.filters import SearchFilter
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated, IsAdminUser
from rest_framework import viewsets, status
from django.contrib.contenttypes.models import ContentType
from rest_framework.response import Response
from rest_framework.views import APIView
from django.views.decorators.csrf import ensure_csrf_cookie

from .models import Note, User, Permission, RolePermission, UserRole, Role
from .serializers import (NoteSerializer, UserSerializer, PermissionSerializer,
                          RolePermissionSerializer, RoleSerializer, UserRoleSerializer,
                          UserRoleCreateSerializer, MyPermissionsResponseSerializer)
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
        return JsonResponse({"success": True})
    return JsonResponse({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['POST'])
def logout_view(request):
    logout(request)
    return JsonResponse({"success": True})


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