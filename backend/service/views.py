# employees/views.py
from django.contrib.auth.models import Permission
from rest_framework.exceptions import PermissionDenied, NotFound
from rest_framework.permissions import IsAuthenticatedOrReadOnly

from core.models import UserRole
from core.serializers import UserSerializer
from core.views import GenericSearchView
from .models import Employee
from .serializers import EmployeeSerializer, CurrentEmployeeSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


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


class CurrentEmployeeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if not request.tenant:
            return Response({"detail": "Tenant header missing or invalid."}, status=400)

        tenant = request.tenant

        # Superusers can see all
        if user.is_superuser:
            # Superusers don't *have* an Employee in every tenant
            # Return partial info
            all_tenants = list(
                UserRole.objects.filter(user=user)
                .select_related('role__tenant')
                .values_list('role__tenant__subdomain', flat=True)
                .distinct()
            )
            return Response({
                "user": UserSerializer(user).data,
                "employee": None,
                "availableTenants": all_tenants,
                "currentTenant": tenant.subdomain,
                "permissions": list(Permission.objects.values_list('codename', flat=True)),
            })

        # Get this user's Employee profile in this tenant
        try:
            employee = Employee.objects.select_related('user', 'location').get(user=user, tenant=tenant)
        except Employee.DoesNotExist:
            raise NotFound("Employee profile not found in this tenant.")

        # List all tenants this user belongs to
        user_tenants = UserRole.objects.filter(user=user)\
            .select_related('role__tenant')\
            .values_list('role__tenant__subdomain', 'role__tenant__name')\
            .distinct()

        availableTenants = [
            {"subdomain": subdomain, "name": name} for subdomain, name in user_tenants
        ]

        # Find all permissions for this user in this tenant
        permissions = Permission.objects.filter(
            rolepermission__role__user_roles__user=user,
            rolepermission__role__tenant=tenant
        ).distinct().values_list('codename', flat=True)

        # Construct response
        data = {
            "user": UserSerializer(employee.user).data,
            "employee": {
                "id": employee.id,
                "location_id": employee.location.id if employee.location else None,
                "location_name": employee.location.name if employee.location else None,
                "role": employee.get_role_display() if hasattr(employee, 'role') else None,
            },
            "availableTenants": availableTenants,
            "currentTenant": tenant.subdomain,
            "permissions": list(permissions),
        }

        return Response(data)
