"""
Signal handlers for WorkItem model.
Follows Salesforce TriggerHandler pattern - all WorkItem integration logic in one place.

Events triggered:
- workitem_created: When a new WorkItem is created
- workitem_status_changed: When WorkItem.status field changes
"""
import logging
from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.contrib.contenttypes.models import ContentType

from tasks.models import WorkItem
from integrations.tasks import send_integration_webhook

logger = logging.getLogger(__name__)

# Store old values before save for comparison
_workitem_old_values = {}


@receiver(pre_save, sender=WorkItem)
def workitem_pre_save(sender, instance, **kwargs):
    """
    Store the old field values before save so we can detect changes.
    This is similar to Trigger.old in Salesforce.
    """
    if instance.pk:  # Only for existing records
        try:
            old_instance = WorkItem.objects.get(pk=instance.pk)
            _workitem_old_values[instance.pk] = {
                'status': old_instance.status,
            }
        except WorkItem.DoesNotExist:
            pass


@receiver(post_save, sender=WorkItem)
def workitem_post_save(sender, instance, created, **kwargs):
    """
    Main signal handler for WorkItem creation and updates.
    Uses transaction.on_commit() to ensure the webhook is only called
    after the database transaction successfully commits.
    """

    # Determine the event type(s) to trigger
    events_to_trigger = []

    if created:
        # New WorkItem created
        events_to_trigger.append('workitem_created')
        logger.debug(f"WorkItem {instance.reference_id} created, will trigger integration")
    else:
        # WorkItem updated - check for specific changes
        old_values = _workitem_old_values.get(instance.pk, {})
        old_status = old_values.get('status')

        if old_status and old_status != instance.status:
            # Status changed - trigger specific status change event
            events_to_trigger.append('workitem_status_changed')
            logger.debug(
                f"WorkItem {instance.reference_id} status changed "
                f"from {old_status} to {instance.status}, will trigger integration"
            )

        # Also trigger generic "workitem_updated" for ANY update (if not already created)
        # This allows users to subscribe to all updates regardless of which field changed
        if old_values:  # Only if we have old values (meaning it's an actual update)
            events_to_trigger.append('workitem_updated')
            logger.debug(
                f"WorkItem {instance.reference_id} updated, will trigger integration"
            )

        # Clean up stored old values
        if instance.pk in _workitem_old_values:
            del _workitem_old_values[instance.pk]

    # If no events to trigger, exit early
    if not events_to_trigger:
        logger.debug(f"No integration events triggered for WorkItem {instance.reference_id}")
        return

    # Schedule webhook calls on transaction commit
    # This ensures the database changes are persisted before calling external systems
    for event_type in events_to_trigger:
        transaction.on_commit(lambda et=event_type: trigger_workitem_integrations(instance, et))


def trigger_workitem_integrations(workitem, event_type):
    """
    Find all active integrations for this tenant and event type,
    then enqueue Celery tasks to call them.

    This function is called inside transaction.on_commit() to ensure
    the WorkItem is fully saved before external systems are notified.
    """
    from integrations.models import TenantIntegration

    # Find all active integrations for this tenant and event type
    integrations = TenantIntegration.objects.filter(
        tenant=workitem.tenant,
        event_type=event_type,
        is_active=True
    )

    if not integrations.exists():
        logger.debug(
            f"No active integrations found for tenant {workitem.tenant.name} "
            f"and event {event_type}"
        )
        return

    logger.info(
        f"Triggering {integrations.count()} integration(s) for WorkItem "
        f"{workitem.reference_id} ({event_type})"
    )

    # Build the payload to send to the webhook
    payload = build_workitem_payload(workitem, event_type)

    # Get ContentType for WorkItem
    content_type = ContentType.objects.get_for_model(WorkItem)

    # Enqueue a Celery task for each integration
    for integration in integrations:
        try:
            send_integration_webhook.delay(
                integration_id=integration.id,
                content_type_id=content_type.id,
                object_id=workitem.id,
                event_type=event_type,
                payload=payload
            )
            logger.debug(
                f"Enqueued webhook task for integration {integration.name} "
                f"(WorkItem {workitem.reference_id})"
            )
        except Exception as exc:
            logger.exception(
                f"Failed to enqueue webhook task for integration {integration.name}: {exc}"
            )


def build_workitem_payload(workitem, event_type):
    """
    Build the JSON payload to send to the integration webhook.
    Customize this based on what data your integrations need.

    Args:
        workitem: WorkItem instance
        event_type: Event type (workitem_created, workitem_status_changed, etc.)

    Returns:
        Dict containing the payload data
    """
    from django.utils.timezone import now

    # Base payload structure
    payload = {
        'event_type': event_type,
        'timestamp': now().isoformat(),
        'tenant': {
            'id': workitem.tenant.id,
            'name': workitem.tenant.name,
        },
        'workitem': {
            'id': workitem.id,
            'reference_id': workitem.reference_id,
            'description': workitem.description,
            'status': workitem.status,
            'type': workitem.type,
            'priority': workitem.priority,
            'created_date': workitem.created_date.isoformat() if workitem.created_date else None,
            'due_date': workitem.due_date.isoformat() if workitem.due_date else None,
            'closed_date': workitem.closed_date.isoformat() if workitem.closed_date else None,

            # Customer info
            'customer': {
                'id': workitem.customer.id,
                'name': workitem.customer.name if hasattr(workitem.customer, 'name') else str(workitem.customer),
                'email': workitem.customer.email if hasattr(workitem.customer, 'email') else None,
            } if workitem.customer else None,

            # Owner/Technician info
            'owner': {
                'id': workitem.owner.id,
                'name': str(workitem.owner),
            } if workitem.owner else None,

            'technician': {
                'id': workitem.technician.id,
                'name': str(workitem.technician),
            } if workitem.technician else None,

            # Asset info
            'customer_asset': {
                'id': workitem.customer_asset.id,
                'name': str(workitem.customer_asset),
            } if workitem.customer_asset else None,

            # Pricing
            'estimated_price': str(workitem.estimated_price) if workitem.estimated_price else None,
            'final_price': str(workitem.final_price) if workitem.final_price else None,
            'repair_cost': str(workitem.repair_cost) if workitem.repair_cost else None,
            'prepaid_amount': str(workitem.prepaid_amount) if workitem.prepaid_amount else None,

            # Location info
            'dropoff_point': {
                'id': workitem.dropoff_point.id,
                'name': str(workitem.dropoff_point),
            } if workitem.dropoff_point else None,

            'pickup_point': {
                'id': workitem.pickup_point.id,
                'name': str(workitem.pickup_point),
            } if workitem.pickup_point else None,

            # Additional fields
            'intake_method': workitem.intake_method,
            'dropoff_method': workitem.dropoff_method,
            'payment_method': workitem.payment_method,
            'comments': workitem.comments,
            'device_condition': workitem.device_condition,
            'accessories': workitem.accessories,
        }
    }

    # Add event-specific data
    if event_type == 'workitem_status_changed':
        old_values = _workitem_old_values.get(workitem.pk, {})
        payload['changes'] = {
            'status': {
                'old': old_values.get('status'),
                'new': workitem.status,
            }
        }

    return payload
