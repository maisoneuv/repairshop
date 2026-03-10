"""
Make tenant fields non-nullable and add TenantAwareManager.
Safe to run on empty tables (clean slate).
"""
import os
from django.db import migrations, models
import django.db.models.deletion
import tenants.managers


def _backfill_null_tenants(apps, schema_editor):
    Tenant = apps.get_model('tenants', 'Tenant')
    tenant_qs = Tenant.objects.all().order_by('id')
    default_subdomain = os.environ.get("DJANGO_DEFAULT_TENANT_SUBDOMAIN")
    tenant = tenant_qs.filter(subdomain=default_subdomain).first() if default_subdomain else None
    if tenant is None:
        tenant = tenant_qs.first()
    if tenant is None:
        return

    model_names = [
        'Category',
        'InventoryList',
        'InventoryItem',
        'InventoryBalance',
        'InventoryTransaction',
        'Supplier',
        'PurchaseOrder',
        'PurchaseOrderItem',
    ]
    for name in model_names:
        Model = apps.get_model('inventory', name)
        Model.objects.filter(tenant_id__isnull=True).update(tenant_id=tenant.id)


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0022_add_tenant_refactor_models'),
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(
            code=_backfill_null_tenants,
            reverse_code=migrations.RunPython.noop,
        ),

        # Add TenantAwareManager to Category
        migrations.AlterModelManagers(
            name='category',
            managers=[
                ('objects', tenants.managers.TenantAwareManager()),
            ],
        ),

        # Make tenant non-nullable on all models
        migrations.AlterField(
            model_name='category',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='inventorylist',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='inventoryitem',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='inventorybalance',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='inventorytransaction',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='supplier',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='purchaseorder',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AlterField(
            model_name='purchaseorderitem',
            name='tenant',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),

        # Fix InventoryTransaction.quantity help_text
        migrations.AlterField(
            model_name='inventorytransaction',
            name='quantity',
            field=models.IntegerField(
                help_text='Positive for incoming stock (purchases, returns), negative for outgoing (sales, usage).',
            ),
        ),
    ]
