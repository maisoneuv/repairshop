"""
Make tenant fields non-nullable and add TenantAwareManager.
Safe to run on empty tables (clean slate).
"""
from django.db import migrations, models
import django.db.models.deletion
import tenants.managers


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0022_add_tenant_refactor_models'),
        ('tenants', '0001_initial'),
    ]

    operations = [
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
