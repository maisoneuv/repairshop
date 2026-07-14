"""
Shared provisioning helpers used by management commands and the tenant
bootstrap flow (backend/tenants/provisioning.py).
"""
from django.contrib.auth.models import Permission

from core.models import Role, RolePermission

ROLE_NAME = "Tenant Admin"
ROLE_DESCRIPTION = (
    "Full access to all tenant data and configuration. "
    "Not a superuser — cannot access Django admin or other tenants' data."
)

# App labels whose permissions are included in this role.
# 'tenants' is intentionally excluded: tenants themselves are managed by superusers only.
INCLUDED_APP_LABELS = {
    "customers",
    "tasks",
    "service",
    "documents",
    "inventory",
    "integrations",
    "core",
    "calls",
}


def ensure_tenant_admin_role(tenant):
    """Get-or-create the "Tenant Admin" role for `tenant` with every permission
    from INCLUDED_APP_LABELS attached. Safe to call repeatedly (idempotent) —
    used both to bootstrap a brand new tenant and to re-sync permissions on an
    existing one after new permissions are added to the app.
    """
    role, _ = Role.objects.get_or_create(
        tenant=tenant,
        name=ROLE_NAME,
        defaults={"description": ROLE_DESCRIPTION},
    )

    all_permissions = Permission.objects.filter(
        content_type__app_label__in=INCLUDED_APP_LABELS
    )
    for permission in all_permissions:
        RolePermission.objects.get_or_create(role=role, permission=permission)

    return role
