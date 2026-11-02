from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied

from core.models import UserRole


class TenantUserMatchesRequestTenant(BasePermission):
    """
    DRF permission to ensure the logged-in user's tenant matches the resolved request.tenant.
    Prevents cross-tenant data access.
    """

    def has_permission(self, request, view):
        # Check if user is logged in
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        if request.tenant is None:
            raise PermissionDenied("Tenant must be specified.")

        if not UserRole.objects.filter(user=request.user, role__tenant=request.tenant).exists():
            raise PermissionDenied("You don't belong to this tenant.")

        return True


class TenantPermissionRequired(BasePermission):
    """
    Requires `codename` within the current tenant.
    Superusers always pass. Non-authenticated requests always fail.
    """
    codename = None

    def has_permission(self, request, _view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        if not request.tenant:
            raise PermissionDenied("Tenant must be specified.")

        if not request.user.has_permission(self.codename, request.tenant):
            raise PermissionDenied(f"You need the {self.codename} permission.")

        return True


class ManageUsersPermission(TenantPermissionRequired):
    codename = 'manage_users'


class ManageProcessPermission(TenantPermissionRequired):
    """Editing the process template rewires how every repair moves through the
    shop, so it is an admin-level right of its own rather than part of
    manage_custom_fields."""
    codename = 'manage_process'
