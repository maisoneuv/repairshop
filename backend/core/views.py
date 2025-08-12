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
        return Note.objects.filter(content_type=content_type, object_id=obj_id)

    def perform_create(self, serializer):
        model = self.kwargs["model"]
        obj_id = self.kwargs["obj_id"]
        content_type = ContentType.objects.get(model=model)
        print(self.request.user)
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