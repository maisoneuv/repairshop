"""
Django management command to create an AI Agent role with basic employee permissions.

Creates a role suitable for an AI agent that can:
- View, create, and update work items and tasks
- Change statuses, open/close items
- Add and view notes/comments
- No delete permissions, no user management

Usage:
    python manage.py create_ai_agent_role --tenant=<subdomain>
    python manage.py create_ai_agent_role --tenant=acme --with-api-key
    python manage.py create_ai_agent_role --all-tenants
    python manage.py create_ai_agent_role --all-tenants --with-api-key
"""
from django.core.management.base import BaseCommand, CommandError
from django.contrib.contenttypes.models import ContentType
from django.contrib.auth.models import Permission

from core.models import Role, RolePermission, APIKey
from tenants.models import Tenant


ROLE_NAME = "AI Agent"

AI_AGENT_PERMISSIONS = [
    # Work items — view all, create, edit (includes status changes, open/close)
    ("tasks", "view_all_workitems"),
    ("tasks", "add_workitem"),
    ("tasks", "change_workitem"),
    # Tasks — view all, create, edit
    ("tasks", "view_all_tasks"),
    ("tasks", "add_task"),
    ("tasks", "change_task"),
    # Customers — view all, create, edit
    ("customers", "view_all_customers"),
    ("customers", "add_customer"),
    ("customers", "change_customer"),
    # Assets (customer devices) — create and edit
    ("customers", "add_asset"),
    ("customers", "change_asset"),
    # Devices & inventory — create/edit device types, view stock
    ("inventory", "add_device"),
    ("inventory", "change_device"),
    ("inventory", "view_inventoryitem"),
    # Notes/comments — add and view
    ("core", "add_note"),
    ("core", "view_note"),
    ("core", "change_note"),
]


class Command(BaseCommand):
    help = 'Create AI Agent role with basic employee permissions for one or all tenants'

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument(
            '--tenant',
            type=str,
            help='Tenant subdomain (e.g., "acme")',
        )
        group.add_argument(
            '--all-tenants',
            action='store_true',
            help='Create role for all tenants',
        )
        parser.add_argument(
            '--with-api-key',
            action='store_true',
            help='Also generate an API key for the created role',
        )

    def handle(self, *args, **options):
        if options['all_tenants']:
            tenants = Tenant.objects.all()
            if not tenants.exists():
                raise CommandError('No tenants found in the database.')
        else:
            try:
                tenants = [Tenant.objects.get(subdomain=options['tenant'])]
            except Tenant.DoesNotExist:
                raise CommandError(f'Tenant "{options["tenant"]}" not found.')

        for tenant in tenants:
            self._create_role_for_tenant(tenant, with_api_key=options['with_api_key'])

    def _create_role_for_tenant(self, tenant, with_api_key=False):
        self.stdout.write(f'\n=== Tenant: {tenant.name} ({tenant.subdomain}) ===')

        # Create or update role
        role, created = Role.objects.get_or_create(
            tenant=tenant,
            name=ROLE_NAME,
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'  ✓ Role "{ROLE_NAME}" created'))
        else:
            self.stdout.write(self.style.WARNING(f'  ~ Role "{ROLE_NAME}" already exists — updating permissions'))

        # Assign permissions
        assigned = 0
        skipped = 0
        missing = []

        for app_label, codename in AI_AGENT_PERMISSIONS:
            try:
                permission = Permission.objects.get(
                    codename=codename,
                    content_type__app_label=app_label,
                )
                _, perm_created = RolePermission.objects.get_or_create(
                    role=role,
                    permission=permission,
                )
                if perm_created:
                    assigned += 1
                    self.stdout.write(f'    + {app_label}.{codename}')
                else:
                    skipped += 1
            except Permission.DoesNotExist:
                missing.append(f'{app_label}.{codename}')

        self.stdout.write(f'  Permissions: {assigned} added, {skipped} already present')

        if missing:
            self.stdout.write(self.style.WARNING(
                f'  ! Permissions not found (may need migrations): {", ".join(missing)}'
            ))

        # List all current permissions on the role
        all_perms = role.role_permissions.select_related('permission').all()
        self.stdout.write(f'  Total permissions on role: {all_perms.count()}')

        # Optionally generate API key
        if with_api_key:
            self._generate_api_key(tenant, role)

    def _generate_api_key(self, tenant, role):
        self.stdout.write('\n  Generating API key...')
        plaintext_key, prefix, key_hash = APIKey.generate_key(environment='live')

        api_key = APIKey.objects.create(
            tenant=tenant,
            name='AI Agent',
            key_hash=key_hash,
            prefix=prefix,
            role=role,
            notes='Auto-generated by create_ai_agent_role command',
            is_active=True,
        )

        self.stdout.write(self.style.SUCCESS('  API KEY (copy now — shown only once):'))
        self.stdout.write(self.style.SUCCESS(f'  {plaintext_key}'))
        self.stdout.write(f'  Prefix: {api_key.prefix}...')
