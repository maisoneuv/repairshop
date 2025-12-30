"""
Signals for the tasks app.

This module handles automatic creation of default picklist values
when new tenants are created.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver
from tenants.models import Tenant
from core.models import PicklistValue


@receiver(post_save, sender=Tenant)
def create_default_picklists(sender, instance, created, **kwargs):
    """
    Create default picklist values for new tenants.

    This signal automatically populates picklist values for:
    - WorkItem status (New, In Progress, Resolved)
    - Task status (To do, In progress, Done, Reopened)
    - Currency (USD, EUR, GBP)

    Args:
        sender: The model class (Tenant)
        instance: The tenant instance
        created: Boolean indicating if this is a new instance
        **kwargs: Additional keyword arguments
    """
    if not created:
        return  # Only run for newly created tenants

    # Define default picklist values
    DEFAULT_PICKLISTS = {
        'workitem_status': [
            ('New', 'New', 0, True),
            ('In Progress', 'In Progress', 1, True),
            ('Resolved', 'Resolved', 2, True),
        ],
        'task_status': [
            ('To do', 'To do', 0, True),
            ('In progress', 'In progress', 1, True),
            ('Done', 'Done', 2, True),
            ('Reopened', 'Reopened', 3, True),
        ],
        'currency': [
            ('USD', 'US Dollar', 0, True),
            ('EUR', 'Euro', 1, True),
            ('GBP', 'British Pound', 2, True),
        ],
    }

    # Create picklist values for the new tenant
    for category, values in DEFAULT_PICKLISTS.items():
        for value, name, sort_order, is_system in values:
            PicklistValue.objects.create(
                tenant=instance,
                category=category,
                value=value,
                name=name,
                sort_order=sort_order,
                is_active=True,
                is_system=is_system
            )
