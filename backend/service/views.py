# employees/views.py
from django.contrib.auth.models import Permission
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.viewsets import ModelViewSet

from core.mixins import TenantScopedMixin
from core.models import UserRole
from core.serializers import UserSerializer
from core.views import GenericSearchView
from .models import Employee, Location, RepairShop
from .serializers import EmployeeSerializer, CurrentEmployeeSerializer, LocationSerializer, ShopSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import filters


class EmployeeSearchView(GenericSearchView):
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['user__first_name', 'user__last_name', 'user__email']

    def get_queryset(self):
        user = self.request.user

        if user.is_superuser:
            return Employee.objects.select_related('user').all()

        if not self.request.tenant:
            return Employee.objects.none()

        if not user.has_permission('view_all_employees', self.request.tenant):
            return Employee.objects.none()

        return Employee.objects.select_related('user').filter(tenant=self.request.tenant)


class LocationSearchView(GenericSearchView):
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['name']

    def get_queryset(self):
        if not self.request.tenant:
            return Location.objects.none()
        return Location.objects.all()


class LocationViewSet(TenantScopedMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = LocationSerializer
    queryset = Location.objects.all()

    def get_queryset(self):
        return (super().get_queryset()
                .select_related("shop", "address", "customer"))


class CurrentEmployeeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if not request.tenant:
            return Response({"detail": "Tenant header missing or invalid."}, status=400)

        tenant = request.tenant

        # Superusers can see all
        # if user.is_superuser:
        #     # Superusers don't *have* an Employee in every tenant
        #     # Return partial info
        #     all_tenants = list(
        #         UserRole.objects.filter(user=user)
        #         .select_related('role__tenant')
        #         .values_list('role__tenant__subdomain', flat=True)
        #         .distinct()
        #     )
        #     return Response({
        #         "user": UserSerializer(user).data,
        #         "employee": None,
        #         "availableTenants": all_tenants,
        #         "currentTenant": tenant.subdomain,
        #         "permissions": list(Permission.objects.values_list('codename', flat=True)),
        #     })

        # Get this user's Employee profile in this tenant
        try:
            employee = Employee.objects.select_related('user', 'location').get(user=user) #todo add tenant filtering
        except Employee.DoesNotExist:
            raise NotFound("Employee profile not found in this tenant.")

        # List all tenants this user belongs to
        user_tenants = UserRole.objects.filter(user=user)\
            .select_related('role__tenant')\
            .values_list('role__tenant__id', 'role__tenant__subdomain', 'role__tenant__name')\
            .distinct()

        availableTenants = [
            {"subdomain": subdomain, "name": name} for subdomain, name in user_tenants
        ]

        # Find all permissions for this user in this tenant
        permissions = Permission.objects.filter(
            rolepermission__role__user_roles__user=user,
            rolepermission__role__tenant=tenant
        ).distinct().values_list('codename', flat=True)

        data = {
            "user": UserSerializer(employee.user).data,
            "employee": {
                "id": employee.id,
                "location_id": employee.location.id if employee.location else None,
                "location_name": employee.location.name if employee.location else None,
                "role": employee.get_role_display() if hasattr(employee, 'role') else None,
            },
            "availableTenants": [
                {"id": t["role__tenant__id"], "subdomain": t["role__tenant__subdomain"], "name": t["role__tenant__name"]}
                for t in availableTenants
            ],
            "currentTenant": {
                "id": tenant.id,
                "subdomain": tenant.subdomain,
                "name": tenant.name,
            },
            "permissions": list(permissions),
        }

        return Response(data)

class ShopViewSet(TenantScopedMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ShopSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    # allow ?type=partner&active=true
    filterset_fields = {"type": ["exact"], "active": ["exact"]}
    search_fields = ["name", "contact_email", "contact_phone"]
    ordering_fields = ["name", "active", "id"]
    ordering = ["name"]

    def get_queryset(self):
        return (super().get_queryset()
                .select_related("address"))

