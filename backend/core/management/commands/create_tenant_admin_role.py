"""
Django management command to create a Tenant Admin role with all application permissions.

Creates a role that gives full access to all business functionality within the tenant,
while enforcing these constraints:
  - Users with this role are NOT superusers (no cross-tenant access)
  - Users with this role should NOT have is_staff=True (no Django admin access)
  - All access is tenant-scoped — enforced by the application middleware and views

Usage:
    python manage.py create_tenant_admin_role --tenant=<subdomain>
    python manage.py create_tenant_admin_role --all-tenants
"""
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import Permission

from core.models import Role, RolePermission
from tenants.models import Tenant


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


class Command(BaseCommand):
    help = "Create Tenant Admin role with all application permissions for one or all tenants"

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument(
            "--tenant",
            type=str,
            help='Tenant subdomain (e.g., "acme")',
        )
        group.add_argument(
            "--all-tenants",
            action="store_true",
            help="Create role for all tenants",
        )

    def handle(self, *args, **options):
        if options["all_tenants"]:
            tenants = Tenant.objects.all()
            if not tenants.exists():
                raise CommandError("No tenants found in the database.")
        else:
            try:
                tenants = [Tenant.objects.get(subdomain=options["tenant"])]
            except Tenant.DoesNotExist:
                raise CommandError(f'Tenant "{options["tenant"]}" not found.')

        all_permissions = Permission.objects.filter(
            content_type__app_label__in=INCLUDED_APP_LABELS
        ).select_related("content_type").order_by("content_type__app_label", "codename")

        if not all_permissions.exists():
            raise CommandError(
                "No permissions found for the included app labels. "
                "Make sure migrations have been run."
            )

        for tenant in tenants:
            self._create_role_for_tenant(tenant, all_permissions)

    def _create_role_for_tenant(self, tenant, all_permissions):
        self.stdout.write(f"\n=== Tenant: {tenant.name} ({tenant.subdomain}) ===")

        role, created = Role.objects.get_or_create(
            tenant=tenant,
            name=ROLE_NAME,
            defaults={"description": ROLE_DESCRIPTION},
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'  ✓ Role "{ROLE_NAME}" created'))
        else:
            self.stdout.write(self.style.WARNING(f'  ~ Role "{ROLE_NAME}" already exists — updating permissions'))

        assigned = 0
        skipped = 0

        for permission in all_permissions:
            _, perm_created = RolePermission.objects.get_or_create(
                role=role,
                permission=permission,
            )
            if perm_created:
                assigned += 1
                self.stdout.write(
                    f"    + {permission.content_type.app_label}.{permission.codename}"
                )
            else:
                skipped += 1

        total = role.role_permissions.count()
        self.stdout.write(
            f"  Permissions: {assigned} added, {skipped} already present, {total} total"
        )
        self.stdout.write(
            self.style.WARNING(
                "  IMPORTANT: Users assigned this role must have "
                "is_staff=False and is_superuser=False to stay out of Django admin."
            )
        )
