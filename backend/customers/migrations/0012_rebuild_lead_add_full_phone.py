from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


def delete_untenanted_leads(apps, _schema_editor):
    """
    The old Lead model had no tenant column, so all pre-existing rows are unscoped
    and cannot be migrated to the multi-tenant schema. They are deleted here.

    If you need to preserve existing lead data, manually set the `tenant` column
    on those rows before running this migration.
    """
    Lead = apps.get_model('customers', 'Lead')
    orphaned = Lead.objects.filter(tenant__isnull=True)
    count = orphaned.count()
    if count:
        print(
            f"\n  WARNING (customers.0012): deleting {count} Lead row(s) with no tenant — "
            "old Lead model had no tenant column and these rows cannot be scoped."
        )
        orphaned.delete()


def backfill_customer_full_phone_numbers(apps, _schema_editor):
    Customer = apps.get_model('customers', 'Customer')
    for customer in Customer.objects.exclude(phone_number=None).exclude(phone_number=''):
        full = f"{customer.prefix}{customer.phone_number}" if customer.prefix else customer.phone_number
        Customer.objects.filter(pk=customer.pk).update(full_phone_number=full)


def populate_lead_full_phone_numbers(apps, _schema_editor):
    Lead = apps.get_model('customers', 'Lead')
    for lead in Lead.objects.exclude(phone_number=None).exclude(phone_number=''):
        full = f"{lead.prefix}{lead.phone_number}" if lead.prefix else lead.phone_number
        Lead.objects.filter(pk=lead.pk).update(full_phone_number=full)


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0011_add_phone_prefix'),
        ('tenants', '0001_initial'),
    ]

    operations = [
        # --- Customer: add full_phone_number and backfill existing rows ---
        migrations.AddField(
            model_name='customer',
            name='full_phone_number',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True),
        ),
        migrations.RunPython(backfill_customer_full_phone_numbers, migrations.RunPython.noop),

        # --- Lead: add new columns (nullable so existing rows don't break) ---
        migrations.AddField(
            model_name='lead',
            name='tenant',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='lead',
            name='prefix',
            field=models.CharField(blank=True, max_length=5, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='full_phone_number',
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='device_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='notes',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='status',
            field=models.CharField(
                choices=[('new', 'New'), ('contacted', 'Contacted'), ('converted', 'Converted')],
                default='new',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='lead',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, default=timezone.now),
            preserve_default=False,
        ),

        # Drop the old global unique constraint on email before data migration
        migrations.AlterField(
            model_name='lead',
            name='email',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),

        # --- Data migration ---
        # Must run before NOT NULL is enforced on tenant, and before field widths are reduced
        migrations.RunPython(delete_untenanted_leads, migrations.RunPython.noop),
        migrations.RunPython(populate_lead_full_phone_numbers, migrations.RunPython.noop),

        # --- Lead: enforce NOT NULL on tenant now that orphans are gone ---
        migrations.AlterField(
            model_name='lead',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),

        # Adjust field widths/validators — safe after delete_untenanted_leads cleared old rows
        migrations.AlterField(
            model_name='lead',
            name='first_name',
            field=models.CharField(max_length=100),
        ),
        migrations.AlterField(
            model_name='lead',
            name='last_name',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='lead',
            name='phone_number',
            field=models.CharField(blank=True, max_length=15, null=True),
        ),

        # Add per-tenant email uniqueness (replaces old global unique=True)
        migrations.AddConstraint(
            model_name='lead',
            constraint=models.UniqueConstraint(
                condition=models.Q(email__isnull=False),
                fields=['tenant', 'email'],
                name='unique_lead_email_per_tenant',
            ),
        ),

        migrations.AlterModelOptions(
            name='lead',
            options={'ordering': ['-created_at']},
        ),
    ]
