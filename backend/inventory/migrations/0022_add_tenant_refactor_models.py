"""
Add tenant isolation to all inventory models, remove EAV models,
remove inventory_list FK from InventoryItem, clean up fields.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0021_lowercase_category_names'),
        ('tenants', '0001_initial'),
    ]

    operations = [
        # ── Step 1: Add tenant FK (nullable) to all models ──────────────

        migrations.AddField(
            model_name='category',
            name='tenant',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='inventorylist',
            name='tenant',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='inventoryitem',
            name='tenant',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='inventorybalance',
            name='tenant',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='inventorytransaction',
            name='tenant',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='supplier',
            name='tenant',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='purchaseorder',
            name='tenant',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='purchaseorderitem',
            name='tenant',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='tenants.tenant',
            ),
        ),

        # ── Step 2: Add category FK to InventoryItem ────────────────────

        migrations.AddField(
            model_name='inventoryitem',
            name='category',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='inventory_items',
                to='inventory.category',
            ),
        ),

        # ── Step 3: Alter fields ────────────────────────────────────────

        # InventoryItem.type: add choices, reduce max_length
        migrations.AlterField(
            model_name='inventoryitem',
            name='type',
            field=models.CharField(
                choices=[('PART', 'Part'), ('CONSUMABLE', 'Consumable'), ('ACCESSORY', 'Accessory')],
                default='PART',
                max_length=20,
            ),
        ),

        # InventoryItem.sku: remove global unique, will add tenant-scoped unique later
        migrations.AlterField(
            model_name='inventoryitem',
            name='sku',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),

        # InventoryBalance: widen rack and shelf_slot
        migrations.AlterField(
            model_name='inventorybalance',
            name='rack',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AlterField(
            model_name='inventorybalance',
            name='shelf_slot',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),

        # InventoryBalance.current_quantity: allow negatives
        migrations.AlterField(
            model_name='inventorybalance',
            name='current_quantity',
            field=models.IntegerField(default=0),
        ),

        # InventoryTransaction.unit_cost: make optional with default 0
        migrations.AlterField(
            model_name='inventorytransaction',
            name='unit_cost',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),

        # InventoryTransaction.transaction_type: add USAGE choice
        migrations.AlterField(
            model_name='inventorytransaction',
            name='transaction_type',
            field=models.CharField(
                choices=[
                    ('PUR', 'Purchase'), ('SAL', 'Sale'), ('ADJ', 'Adjustment'),
                    ('RET', 'Return'), ('TIN', 'Transfer In'), ('TOUT', 'Transfer Out'),
                    ('USE', 'Usage'),
                ],
                max_length=4,
            ),
        ),

        # Supplier.name: remove global unique (will add tenant-scoped)
        migrations.AlterField(
            model_name='supplier',
            name='name',
            field=models.CharField(max_length=100),
        ),

        # ── Step 4: Remove deprecated fields ────────────────────────────

        migrations.RemoveField(
            model_name='inventoryitem',
            name='inventory_list',
        ),
        migrations.RemoveField(
            model_name='inventoryitem',
            name='parent_inventory_item',
        ),

        # ── Step 5: Delete EAV models ───────────────────────────────────

        migrations.DeleteModel(name='PartAttributeValue'),
        migrations.DeleteModel(name='AttributeDefinition'),

        # ── Step 6: Add unique_together constraints ─────────────────────

        migrations.AlterUniqueTogether(
            name='inventoryitem',
            unique_together={('tenant', 'sku')},
        ),
        migrations.AlterUniqueTogether(
            name='supplier',
            unique_together={('tenant', 'name')},
        ),
    ]
