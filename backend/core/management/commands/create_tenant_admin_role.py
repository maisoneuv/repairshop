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

from core.provisioning import ROLE_NAME, INCLUDED_APP_LABELS, ensure_tenant_admin_role
from tenants.models import Tenant


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

        if not Permission.objects.filter(content_type__app_label__in=INCLUDED_APP_LABELS).exists():
            raise CommandError(
                "No permissions found for the included app labels. "
                "Make sure migrations have been run."
            )

        for tenant in tenants:
            self._create_role_for_tenant(tenant)

    def _create_role_for_tenant(self, tenant):
        self.stdout.write(f"\n=== Tenant: {tenant.name} ({tenant.subdomain}) ===")

        role_existed = tenant.roles.filter(name=ROLE_NAME).exists()
        before = 0 if not role_existed else tenant.roles.get(name=ROLE_NAME).role_permissions.count()

        role = ensure_tenant_admin_role(tenant)

        if not role_existed:
            self.stdout.write(self.style.SUCCESS(f'  ✓ Role "{ROLE_NAME}" created'))
        else:
            self.stdout.write(self.style.WARNING(f'  ~ Role "{ROLE_NAME}" already exists — updating permissions'))

        total = role.role_permissions.count()
        self.stdout.write(
            f"  Permissions: {total - before} added, {before} already present, {total} total"
        )
        self.stdout.write(
            self.style.WARNING(
                "  IMPORTANT: Users assigned this role must have "
                "is_staff=False and is_superuser=False to stay out of Django admin."
            )
        )
