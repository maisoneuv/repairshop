"""
Signals for the tasks app.

This module handles:
- Automatic creation of default picklist values when new tenants are created
- Auto-creating notes on WorkItems when status changes (WorkItem or child Task)
"""

import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from tenants.models import Tenant
from core.models import Note, PicklistValue
from tasks.models import Task, WorkItem

logger = logging.getLogger(__name__)

# Store old status values before save for change detection
_workitem_old_status = {}
_task_old_status = {}


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
            ('PLN', 'Polish Zloty', 0, True),
            ('USD', 'US Dollar', 1, True),
            ('EUR', 'Euro', 2, True),
            ('GBP', 'British Pound', 3, True),
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


# ---------------------------------------------------------------------------
# WorkItem status change → note on WorkItem
# ---------------------------------------------------------------------------

@receiver(pre_save, sender=WorkItem)
def workitem_status_pre_save(sender, instance, **kwargs):
    """Capture old status before save so we can detect changes."""
    if instance.pk:
        try:
            _workitem_old_status[instance.pk] = WorkItem.objects.values_list(
                'status', flat=True
            ).get(pk=instance.pk)
        except WorkItem.DoesNotExist:
            pass


@receiver(post_save, sender=WorkItem)
def workitem_status_note(sender, instance, created, **kwargs):
    """Create a system note on the WorkItem when its status changes."""
    if created:
        return

    old_status = _workitem_old_status.pop(instance.pk, None)
    if old_status and old_status != instance.status:
        author = getattr(instance, '_changed_by', None)
        Note.objects.create(
            author=author,
            content=f"Status changed from '{old_status}' to '{instance.status}'",
            content_object=instance,
        )
        logger.debug(
            "WorkItem %s: status note created (%s → %s)",
            instance.reference_id, old_status, instance.status,
        )


# ---------------------------------------------------------------------------
# Task status change → note on parent WorkItem
# ---------------------------------------------------------------------------

@receiver(pre_save, sender=Task)
def task_status_pre_save(sender, instance, **kwargs):
    """Capture old status before save so we can detect changes."""
    if instance.pk:
        try:
            _task_old_status[instance.pk] = Task.objects.values_list(
                'status', flat=True
            ).get(pk=instance.pk)
        except Task.DoesNotExist:
            pass


@receiver(post_save, sender=Task)
def task_status_note(sender, instance, created, **kwargs):
    """Create a note on the Task when its status changes.

    The note is attached to the Task itself so that the cross-source
    logic in NoteViewSet automatically surfaces it on the parent WorkItem
    with the correct source_model/source_id for the "From Task #x" badge.
    """
    if created:
        return

    old_status = _task_old_status.pop(instance.pk, None)
    if old_status and old_status != instance.status:
        task_label = instance.task_type.name if instance.task_type else f"Task #{instance.pk}"
        author = getattr(instance, '_changed_by', None)
        Note.objects.create(
            author=author,
            content=f"Task '{task_label}' status changed from '{old_status}' to '{instance.status}'",
            content_object=instance,
        )
        logger.debug(
            "Task %s: status note created (%s → %s)",
            instance.pk, old_status, instance.status,
        )
