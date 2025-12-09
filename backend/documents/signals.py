"""
Django signals for automatic form document generation.
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver
from tasks.models import WorkItem

logger = logging.getLogger(__name__)


@receiver(post_save, sender=WorkItem)
def auto_generate_intake_form(sender, instance, created, **kwargs):
    """
    Automatically generate intake form PDF when a new work item is created.

    This signal:
    - Only triggers on work item creation (not updates)
    - Checks if an active intake template exists for the tenant
    - Queues async PDF generation task (doesn't block work item creation)
    - Handles errors gracefully - work item creation never fails due to PDF issues

    Args:
        sender: WorkItem model class
        instance: WorkItem instance that was saved
        created: Boolean - True if this is a new object
        **kwargs: Additional signal kwargs
    """
    # Only generate for new work items
    if not created:
        return

    try:
        from .models import FormTemplate
        from .tasks import generate_form_document_task

        # Check if there's an active intake template for this tenant
        has_active_template = FormTemplate.objects.filter(
            tenant=instance.tenant,
            form_type=FormTemplate.FORM_TYPE_INTAKE,
            is_active=True
        ).exists()

        if not has_active_template:
            logger.debug(
                f"No active intake template found for tenant {instance.tenant.id}. "
                f"Skipping auto-generation for work item {instance.reference_id}"
            )
            return

        # Queue async task for PDF generation
        # This runs in the background and won't block work item creation
        logger.info(
            f"Queuing intake form generation for work item {instance.reference_id} "
            f"(tenant: {instance.tenant.id})"
        )

        generate_form_document_task.delay(
            work_item_id=instance.id,
            template_id=None,  # Use active template
            form_type=FormTemplate.FORM_TYPE_INTAKE,
            user_id=None  # Auto-generated (not triggered by user)
        )

        logger.info(f"Successfully queued intake form generation task for work item {instance.reference_id}")

    except Exception as e:
        # Log the error but don't raise - we don't want to block work item creation
        logger.error(
            f"Failed to queue intake form generation for work item {instance.reference_id}: {str(e)}",
            exc_info=True
        )
