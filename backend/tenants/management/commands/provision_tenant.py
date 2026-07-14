"""
Django management command to bootstrap a brand new tenant: creates the
Tenant (if it doesn't exist yet), the Tenant Admin role, a default
RepairShop/Location/CashRegister, and an admin user who can log in and
start working immediately.

Usage:
    python manage.py provision_tenant --subdomain=acme --name="Acme Inc" --admin-email=owner@acme.com
    python manage.py provision_tenant --subdomain=acme --admin-email=owner@acme.com --admin-password=hunter2
"""
import secrets

from django.core.management.base import BaseCommand, CommandError

from tenants.models import Tenant
from tenants.provisioning import TenantAlreadyProvisionedError, provision_tenant


class Command(BaseCommand):
    help = "Bootstrap a new tenant with a Tenant Admin role, default shop/location, and an admin user."

    def add_arguments(self, parser):
        parser.add_argument("--subdomain", type=str, required=True, help='Tenant subdomain (e.g., "acme")')
        parser.add_argument("--name", type=str, help="Tenant display name. Required if the tenant doesn't exist yet.")
        parser.add_argument("--admin-email", type=str, required=True, help="Email for the tenant's first admin user")
        parser.add_argument("--admin-password", type=str, help="Password for the admin user. Random if omitted.")
        parser.add_argument("--admin-name", type=str, default="", help="Display name for the admin user")
        parser.add_argument("--shop-name", type=str, help='Default shop name (default: "<tenant name> Shop")')
        parser.add_argument("--street", type=str, default="Main Street")
        parser.add_argument("--building-number", type=str, default="1")
        parser.add_argument("--city", type=str, help="Default: tenant name")
        parser.add_argument("--postal-code", type=str, default="00-000")
        parser.add_argument("--country", type=str, default="Poland")

    def handle(self, *args, **options):
        tenant, tenant_created = Tenant.objects.get_or_create(
            subdomain=options["subdomain"],
            defaults={"name": options["name"] or options["subdomain"]},
        )
        if tenant_created:
            self.stdout.write(self.style.SUCCESS(f"Created tenant '{tenant.name}' ({tenant.subdomain})"))
        elif options["name"]:
            self.stdout.write(self.style.WARNING(
                f"Tenant '{tenant.subdomain}' already existed — ignoring --name."
            ))

        admin_password = options["admin_password"] or secrets.token_urlsafe(16)

        try:
            result = provision_tenant(
                tenant,
                admin_email=options["admin_email"],
                admin_password=admin_password,
                admin_name=options["admin_name"],
                shop_name=options["shop_name"],
                street=options["street"],
                building_number=options["building_number"],
                city=options["city"],
                postal_code=options["postal_code"],
                country=options["country"],
            )
        except TenantAlreadyProvisionedError as exc:
            raise CommandError(str(exc))

        self.stdout.write(self.style.SUCCESS(f"\n=== Tenant '{tenant.name}' provisioned ==="))
        self.stdout.write(f"  Shop:     {result['shop'].name}")
        self.stdout.write(f"  Location: {result['location'].name}")
        self.stdout.write(f"  Register: {result['cash_register'].name}")
        self.stdout.write(f"  Role:     {result['role'].name}")
        self.stdout.write(self.style.SUCCESS(f"  Admin user: {result['admin_user'].email}"))
        if not options["admin_password"]:
            self.stdout.write(self.style.SUCCESS(f"  Admin password (copy now — shown only once): {admin_password}"))
        self.stdout.write(self.style.WARNING("  Have the admin change their password after first login."))
