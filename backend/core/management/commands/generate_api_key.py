"""
Django management command to generate API keys via CLI.

Usage:
    python manage.py generate_api_key --tenant=<subdomain> --role=<role_id> --name="Integration Name"

Examples:
    python manage.py generate_api_key --tenant=acme --role=5 --name="n8n Production"
    python manage.py generate_api_key --tenant=acme --role=5 --name="Zapier" --expires=2024-12-31
    python manage.py generate_api_key --tenant=acme --role=5 --name="Testing" --environment=test
"""
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from datetime import datetime

from core.models import APIKey, Role
from tenants.models import Tenant


class Command(BaseCommand):
    help = 'Generate a new API key for external system authentication'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            type=str,
            required=True,
            help='Tenant subdomain (e.g., "acme" for acme.example.com)'
        )
        parser.add_argument(
            '--role',
            type=int,
            required=True,
            help='Role ID that determines API key permissions'
        )
        parser.add_argument(
            '--name',
            type=str,
            required=True,
            help='Descriptive name for the API key (e.g., "n8n Production")'
        )
        parser.add_argument(
            '--environment',
            type=str,
            default='live',
            choices=['live', 'test'],
            help='Environment type (affects key prefix: sk_live_ or sk_test_)'
        )
        parser.add_argument(
            '--expires',
            type=str,
            help='Optional expiration date in YYYY-MM-DD format'
        )
        parser.add_argument(
            '--notes',
            type=str,
            default='',
            help='Optional notes about this API key'
        )
        parser.add_argument(
            '--integration',
            type=int,
            help='Optional: Link to TenantIntegration ID for bidirectional flows'
        )

    def handle(self, *args, **options):
        tenant_subdomain = options['tenant']
        role_id = options['role']
        name = options['name']
        environment = options['environment']
        expires_str = options.get('expires')
        notes = options.get('notes', '')
        integration_id = options.get('integration')

        self.stdout.write(self.style.WARNING('\n=== Generating API Key ===\n'))

        # Validate tenant
        try:
            tenant = Tenant.objects.get(subdomain=tenant_subdomain)
            self.stdout.write(f'✓ Tenant: {tenant.name} ({tenant.subdomain})')
        except Tenant.DoesNotExist:
            raise CommandError(f'Tenant with subdomain "{tenant_subdomain}" not found')

        # Validate role
        try:
            role = Role.objects.get(id=role_id, tenant=tenant)
            self.stdout.write(f'✓ Role: {role.name}')

            # Show permissions
            permissions = role.role_permissions.select_related('permission').all()
            if permissions:
                self.stdout.write('  Permissions:')
                for rp in permissions:
                    self.stdout.write(f'    - {rp.permission.codename}')
            else:
                self.stdout.write(self.style.WARNING('  Warning: Role has no permissions assigned'))

        except Role.DoesNotExist:
            raise CommandError(
                f'Role with ID {role_id} not found for tenant "{tenant.name}". '
                f'Use Django admin or shell to list available roles.'
            )

        # Parse expiration date if provided
        expires_at = None
        if expires_str:
            try:
                expires_at = timezone.make_aware(
                    datetime.strptime(expires_str, '%Y-%m-%d')
                )
                self.stdout.write(f'✓ Expires: {expires_at.strftime("%Y-%m-%d")}')
            except ValueError:
                raise CommandError(
                    f'Invalid expiration date format: "{expires_str}". '
                    f'Use YYYY-MM-DD format (e.g., 2024-12-31)'
                )

        # Validate integration if provided
        integration = None
        if integration_id:
            from integrations.models import TenantIntegration
            try:
                integration = TenantIntegration.objects.get(
                    id=integration_id,
                    tenant=tenant
                )
                self.stdout.write(f'✓ Linked Integration: {integration.name}')
            except TenantIntegration.DoesNotExist:
                raise CommandError(
                    f'Integration with ID {integration_id} not found for tenant "{tenant.name}"'
                )

        # Generate the API key
        self.stdout.write('\n' + self.style.WARNING('Generating secure API key...'))
        plaintext_key, prefix, key_hash = APIKey.generate_key(environment=environment)

        # Create the API key record
        api_key = APIKey.objects.create(
            tenant=tenant,
            name=name,
            key_hash=key_hash,
            prefix=prefix,
            role=role,
            integration=integration,
            expires_at=expires_at,
            notes=notes,
            is_active=True,
        )

        # Display success message with the plaintext key
        self.stdout.write('\n' + self.style.SUCCESS('=' * 70))
        self.stdout.write(self.style.SUCCESS('API KEY GENERATED SUCCESSFULLY!'))
        self.stdout.write(self.style.SUCCESS('=' * 70))
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('IMPORTANT: Copy this key now. It will NEVER be shown again!'))
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('┌' + '─' * 68 + '┐'))
        self.stdout.write(self.style.SUCCESS('│ ' + plaintext_key.ljust(66) + ' │'))
        self.stdout.write(self.style.SUCCESS('└' + '─' * 68 + '┘'))
        self.stdout.write('')
        self.stdout.write(f'Name:        {api_key.name}')
        self.stdout.write(f'Tenant:      {api_key.tenant.name} ({api_key.tenant.subdomain})')
        self.stdout.write(f'Role:        {api_key.role.name}')
        self.stdout.write(f'Prefix:      {api_key.prefix}...')
        self.stdout.write(f'Active:      {api_key.is_active}')
        if api_key.expires_at:
            self.stdout.write(f'Expires:     {api_key.expires_at.strftime("%Y-%m-%d")}')
        if api_key.integration:
            self.stdout.write(f'Integration: {api_key.integration.name}')
        self.stdout.write(f'Created:     {api_key.created_on.strftime("%Y-%m-%d %H:%M:%S")}')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('=' * 70))
        self.stdout.write('')
        self.stdout.write('Usage Example:')
        self.stdout.write('')
        self.stdout.write('  curl -H "Authorization: Bearer ' + plaintext_key + '" \\')
        self.stdout.write('       https://your-domain.com/api/work-items/')
        self.stdout.write('')
        self.stdout.write(self.style.WARNING('=' * 70))
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('✓ API key saved to database'))
        self.stdout.write(self.style.SUCCESS('✓ You can manage this key in Django admin: Core > API Keys'))
        self.stdout.write('')
