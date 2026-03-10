from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import InventoryTransaction, InventoryBalance


@receiver(post_save, sender=InventoryTransaction)
def update_inventory_balance(sender, instance, created, **kwargs):
    if not created:
        return

    balance, _ = InventoryBalance.objects.get_or_create(
        tenant=instance.tenant,
        inventory_item=instance.inventory_item,
        inventory_list=instance.inventory_list,
        defaults={
            'quantity_unit': instance.quantity_unit,
            'current_quantity': 0,
            'average_cost': 0,
        }
    )

    # Update average cost on purchases (weighted average)
    if instance.transaction_type == InventoryTransaction.PURCHASE and instance.quantity > 0 and instance.unit_cost > 0:
        old_total = balance.current_quantity * balance.average_cost
        new_total = instance.quantity * instance.unit_cost
        new_quantity = balance.current_quantity + instance.quantity
        if new_quantity > 0:
            balance.average_cost = (old_total + new_total) / new_quantity

    balance.current_quantity += instance.quantity
    balance.save()
