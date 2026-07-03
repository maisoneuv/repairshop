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

    # (value, name, sort_order, is_system, color, status_role)
    DEFAULT_PICKLISTS = {
        'workitem_status': [
            ('New',         'New',         0, True, 'sky',     'initial'),
            ('In Progress', 'In Progress', 1, True, 'amber',   'in_progress'),
            ('Resolved',    'Resolved',    2, True, 'emerald', 'resolved'),
        ],
        'task_status': [
            ('To do',      'To do',      0, True, 'gray',    'initial'),
            ('In progress','In progress',1, True, 'amber',   'in_progress'),
            ('Done',       'Done',       2, True, 'emerald', 'resolved'),
            ('Reopened',   'Reopened',   3, True, 'rose',    'in_progress'),
        ],
        'currency': [
            ('PLN', 'Polish Zloty',  0, True, 'gray', None),
            ('USD', 'US Dollar',     1, True, 'gray', None),
            ('EUR', 'Euro',          2, True, 'gray', None),
            ('GBP', 'British Pound', 3, True, 'gray', None),
        ],
        'workitem_type': [
            ('Chargeable Repair', 'Chargeable Repair', 0, True, 'sky',     None),
            ('Warranty Repair',   'Warranty Repair',   1, True, 'emerald', None),
        ],
        'workitem_priority': [
            ('Standard', 'Standard', 0, True, 'gray',  None),
            ('Express',  'Express',  1, True, 'amber', None),
        ],
        'intake_method': [
            ('walk_in', 'Customer drop-off in person',  0, True, 'gray',   None),
            ('courier', 'Courier',                      1, True, 'sky',    None),
            ('driver',  'Courier pickup from customer', 2, True, 'indigo', None),
        ],
        'dropoff_method': [
            ('walk_in', 'Customer pick-up in person',   0, True, 'gray',   None),
            ('courier', 'Courier',                      1, True, 'sky',    None),
            ('driver',  'Courier delivery to customer', 2, True, 'indigo', None),
        ],
        'payment_method': [
            ('Card', 'Card', 0, True, 'sky',   None),
            ('Cash', 'Cash', 1, True, 'amber', None),
        ],
        'employee_role': [
            ('Manager',          'Manager',          0, True, 'purple', None),
            ('Technician',       'Technician',       1, True, 'sky',    None),
            ('Customer Service', 'Customer Service', 2, True, 'teal',   None),
            ('External Service', 'External Service', 3, True, 'gray',   None),
        ],
        'referral_source': [
            ('Internet Search',       'Internet Search',       0, True, 'sky',    None),
            ('Social Media',          'Social Media',          1, True, 'indigo', None),
            ('Friend/Family Referral','Friend/Family',         2, True, 'emerald',None),
            ('Online Advertisement',  'Online Advertisement',  3, True, 'amber',  None),
            ('Offline Advertisement', 'Offline Advertisement', 4, True, 'orange', None),
            ('Walk-by',               'Walk-by',               5, True, 'teal',   None),
            ('Returning Customer',    'Returning Customer',    6, True, 'purple', None),
            ('Other',                 'Other',                 7, True, 'gray',   None),
        ],
        'lead_status': [
            ('new',       'New',       0, True, 'sky',    'initial'),
            ('contacted', 'Contacted', 1, True, 'amber',  'in_progress'),
            ('callback',  'Callback',  2, True, 'orange', 'in_progress'),
            ('converted', 'Converted', 3, True, 'emerald','resolved'),
        ],
    }

    for category, values in DEFAULT_PICKLISTS.items():
        for value, name, sort_order, is_system, color, status_role in values:
            PicklistValue.objects.create(
                tenant=instance,
                category=category,
                value=value,
                name=name,
                sort_order=sort_order,
                is_active=True,
                is_system=is_system,
                color=color,
                status_role=status_role,
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
