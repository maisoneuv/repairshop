"""
Signal handlers for Task model.
Follows Salesforce TriggerHandler pattern - all Task integration logic in one place.

Events triggered:
- task_created: When a new Task is created
- task_status_changed: When Task.status field changes
- task_updated: When any Task field changes
"""
import logging
from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.contrib.contenttypes.models import ContentType

from tasks.models import Task
from integrations.tasks import send_integration_webhook

logger = logging.getLogger(__name__)

# Store old values before save for comparison
_task_old_values = {}


@receiver(pre_save, sender=Task)
def task_pre_save(sender, instance, **kwargs):
    """
    Store the old field values before save so we can detect changes.
    This is similar to Trigger.old in Salesforce.
    """
    if instance.pk:  # Only for existing records
        try:
            old_instance = Task.objects.get(pk=instance.pk)
            _task_old_values[instance.pk] = {
                'status': old_instance.status,
            }
        except Task.DoesNotExist:
            pass


@receiver(post_save, sender=Task)
def task_post_save(sender, instance, created, **kwargs):
    """
    Main signal handler for Task creation and updates.
    Uses transaction.on_commit() to ensure the webhook is only called
    after the database transaction successfully commits.
    """

    # Determine the event type(s) to trigger
    events_to_trigger = []

    if created:
        # New Task created
        events_to_trigger.append('task_created')
        logger.debug(f"Task {instance.pk} created, will trigger integration")
    else:
        # Task updated - check for specific changes
        old_values = _task_old_values.get(instance.pk, {})
        old_status = old_values.get('status')

        if old_status and old_status != instance.status:
            # Status changed - trigger specific status change event
            events_to_trigger.append('task_status_changed')
            logger.debug(
                f"Task {instance.pk} status changed "
                f"from {old_status} to {instance.status}, will trigger integration"
            )

        # Also trigger generic "task_updated" for ANY update
        if old_values:  # Only if we have old values (meaning it's an actual update)
            events_to_trigger.append('task_updated')
            logger.debug(
                f"Task {instance.pk} updated, will trigger integration"
            )

        # Clean up stored old values
        if instance.pk in _task_old_values:
            del _task_old_values[instance.pk]

    # If no events to trigger, exit early
    if not events_to_trigger:
        logger.debug(f"No integration events triggered for Task {instance.pk}")
        return

    # Schedule webhook calls on transaction commit
    # This ensures the database changes are persisted before calling external systems
    for event_type in events_to_trigger:
        transaction.on_commit(lambda et=event_type: trigger_task_integrations(instance, et))


def trigger_task_integrations(task, event_type):
    """
    Find all active integrations for this tenant and event type,
    then enqueue Celery tasks to call them.

    This function is called inside transaction.on_commit() to ensure
    the Task is fully saved before external systems are notified.
    """
    from integrations.models import TenantIntegration

    # Find all active integrations for this tenant and event type
    integrations = TenantIntegration.objects.filter(
        tenant=task.tenant,
        event_type=event_type,
        is_active=True
    )

    if not integrations.exists():
        logger.debug(
            f"No active integrations found for tenant {task.tenant.name} "
            f"and event {event_type}"
        )
        return

    logger.info(
        f"Triggering {integrations.count()} integration(s) for Task "
        f"{task.pk} ({event_type})"
    )

    # Build the payload to send to the webhook
    payload = build_task_payload(task, event_type)

    # Get ContentType for Task
    content_type = ContentType.objects.get_for_model(Task)

    # Enqueue a Celery task for each integration
    for integration in integrations:
        try:
            send_integration_webhook.delay(
                integration_id=integration.id,
                content_type_id=content_type.id,
                object_id=task.id,
                event_type=event_type,
                payload=payload
            )
            logger.debug(
                f"Enqueued webhook task for integration {integration.name} "
                f"(Task {task.pk})"
            )
        except Exception as exc:
            logger.exception(
                f"Failed to enqueue webhook task for integration {integration.name}: {exc}"
            )


def build_task_payload(task, event_type):
    """
    Build the JSON payload to send to the integration webhook.

    Args:
        task: Task instance
        event_type: Event type (task_created, task_status_changed, etc.)

    Returns:
        Dict containing the payload data
    """
    from django.utils.timezone import now

    # Base payload structure
    payload = {
        'event_type': event_type,
        'timestamp': now().isoformat(),
        'tenant': {
            'id': task.tenant.id,
            'name': task.tenant.name,
        },
        'task': {
            'id': task.id,
            'summary': task.summary,
            'description': task.description,
            'status': task.status,
            'created_date': task.created_date.isoformat() if task.created_date else None,
            'due_date': task.due_date.isoformat() if task.due_date else None,
            'completed_date': task.completed_date.isoformat() if task.completed_date else None,
            'actual_duration': str(task.actual_duration) if task.actual_duration else None,

            # Task type info
            'task_type': {
                'id': task.task_type.id,
                'name': task.task_type.name,
            } if task.task_type else None,

            # Related WorkItem info
            'work_item': {
                'id': task.work_item.id,
                'reference_id': task.work_item.reference_id,
                'description': task.work_item.description,
                'status': task.work_item.status,
            } if task.work_item else None,

            # Assigned employee info
            'assigned_employee': {
                'id': task.assigned_employee.id,
                'name': str(task.assigned_employee),
            } if task.assigned_employee else None,
        }
    }

    # Add event-specific data
    if event_type == 'task_status_changed':
        old_values = _task_old_values.get(task.pk, {})
        payload['changes'] = {
            'status': {
                'old': old_values.get('status'),
                'new': task.status,
            }
        }

    return payload
