"""
Management command to load default form templates.

Usage:
    python manage.py load_default_templates [--tenant-id=1]
"""
import os
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

from tenants.models import Tenant
from documents.models import FormTemplate


class Command(BaseCommand):
    help = 'Load default form templates for a tenant'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=int,
            help='Tenant ID to load templates for (defaults to first tenant)',
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Overwrite existing templates with same name',
        )

    def handle(self, *args, **options):
        tenant_id = options.get('tenant_id')
        overwrite = options.get('overwrite', False)

        # Get tenant
        if tenant_id:
            try:
                tenant = Tenant.objects.get(id=tenant_id)
            except Tenant.DoesNotExist:
                raise CommandError(f'Tenant with ID {tenant_id} does not exist')
        else:
            # Use first tenant
            tenant = Tenant.objects.first()
            if not tenant:
                raise CommandError('No tenants found. Please create a tenant first.')

        self.stdout.write(f'Loading default templates for tenant: {tenant.name} (ID: {tenant.id})')

        # Load default intake template
        self._load_intake_template(tenant, overwrite)

        self.stdout.write(self.style.SUCCESS('✓ Default templates loaded successfully!'))

    def _load_intake_template(self, tenant, overwrite):
        """Load the default intake form template"""
        template_name = 'Default Intake Form'
        form_type = FormTemplate.FORM_TYPE_INTAKE

        # Check if template already exists
        existing = FormTemplate.objects.filter(
            tenant=tenant,
            form_type=form_type,
            name=template_name
        ).first()

        if existing and not overwrite:
            self.stdout.write(
                self.style.WARNING(
                    f'  ⚠ Template "{template_name}" already exists. '
                    f'Use --overwrite to replace it.'
                )
            )
            return

        # Read template HTML from fixtures
        fixture_path = os.path.join(
            settings.BASE_DIR,
            'documents',
            'fixtures',
            'default_intake_template.html'
        )

        if not os.path.exists(fixture_path):
            raise CommandError(f'Template fixture not found at: {fixture_path}')

        with open(fixture_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        # Create or update template
        if existing:
            existing.html_content = html_content
            existing.is_active = True
            existing.save()
            self.stdout.write(
                self.style.SUCCESS(f'  ✓ Updated template: {template_name}')
            )
        else:
            FormTemplate.objects.create(
                tenant=tenant,
                form_type=form_type,
                name=template_name,
                html_content=html_content,
                is_active=True,
                created_by=None  # System-created
            )
            self.stdout.write(
                self.style.SUCCESS(f'  ✓ Created template: {template_name}')
            )

        self.stdout.write(f'     Form type: {form_type}')
        self.stdout.write(f'     Status: Active')
        self.stdout.write(f'     HTML size: {len(html_content)} characters')
