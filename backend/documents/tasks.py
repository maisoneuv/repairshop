"""
Celery tasks for asynchronous PDF generation.
These tasks run in the background to avoid blocking work item creation.
"""
import logging
from celery import shared_task
from django.core.exceptions import ObjectDoesNotExist

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 2, 'countdown': 30},
    retry_backoff=True,
    retry_jitter=True,
)
def generate_form_document_task(self, work_item_id, template_id=None, form_type='intake', user_id=None):
    """
    Generate a form document (PDF) for a work item asynchronously.

    This task:
    1. Fetches the work item and template
    2. Generates PDF using Playwright
    3. Creates a FormDocument record with status and file path
    4. Handles errors gracefully without blocking work item creation

    Args:
        work_item_id (int): ID of the WorkItem
        template_id (int, optional): Specific template ID. If None, uses active template for form_type
        form_type (str): Type of form to generate (default: 'intake')
        user_id (int, optional): ID of user who triggered generation. None = auto-generated

    Returns:
        dict: Result with document_id and status
    """
    from tasks.models import WorkItem
    from core.models import User
    from .models import FormTemplate, FormDocument
    from .pdf_generator import generate_pdf_from_work_item, PDFGenerationError

    logger.info(f"Starting form document generation task for work item {work_item_id}, form_type: {form_type}")

    document = None

    try:
        # Fetch work item with all related data
        work_item = WorkItem.objects.select_related(
            'customer',
            'customer__address',
            'customer_asset',
            'customer_asset__device',
            'owner',
            'technician',
            'dropoff_point',
            'dropoff_point__address',
            'pickup_point',
            'pickup_point__address',
            'fulfillment_shop',
            'tenant'
        ).get(id=work_item_id)

        # Get template
        if template_id:
            template = FormTemplate.objects.get(id=template_id, tenant=work_item.tenant)
        else:
            # Get active template for this form type and tenant
            template = FormTemplate.objects.filter(
                tenant=work_item.tenant,
                form_type=form_type,
                is_active=True
            ).first()

        if not template:
            error_msg = f"No active template found for form type '{form_type}' in tenant {work_item.tenant.id}"
            logger.error(error_msg)

            # Create failed document record
            document = FormDocument.objects.create(
                tenant=work_item.tenant,
                form_type=form_type,
                work_item=work_item,
                template=None,
                file_path='',
                generated_by_id=user_id,
                status=FormDocument.STATUS_ERROR,
                error_message=error_msg
            )

            return {
                'status': 'error',
                'document_id': document.id,
                'error': error_msg
            }

        # Create pending document record
        document = FormDocument.objects.create(
            tenant=work_item.tenant,
            form_type=form_type,
            work_item=work_item,
            template=template,
            file_path='',  # Will be updated after PDF generation
            generated_by_id=user_id,
            status=FormDocument.STATUS_PENDING
        )

        # Generate PDF
        logger.info(f"Generating PDF for work item {work_item.reference_id} using template '{template.name}'")
        file_path = generate_pdf_from_work_item(work_item, template)

        # Update document with success status and file path
        document.file_path = file_path
        document.status = FormDocument.STATUS_SUCCESS
        document.save()

        logger.info(f"Successfully generated form document {document.id} for work item {work_item.reference_id}")

        return {
            'status': 'success',
            'document_id': document.id,
            'file_path': file_path
        }

    except ObjectDoesNotExist as e:
        error_msg = f"Object not found: {str(e)}"
        logger.error(f"Form document generation failed: {error_msg}")

        if document:
            document.status = FormDocument.STATUS_ERROR
            document.error_message = error_msg
            document.save()

        return {
            'status': 'error',
            'document_id': document.id if document else None,
            'error': error_msg
        }

    except PDFGenerationError as e:
        error_msg = f"PDF generation failed: {str(e)}"
        logger.error(f"Form document generation failed: {error_msg}")

        if document:
            document.status = FormDocument.STATUS_ERROR
            document.error_message = error_msg
            document.save()

        # Don't retry on PDF generation errors (likely template issue)
        return {
            'status': 'error',
            'document_id': document.id if document else None,
            'error': error_msg
        }

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.exception(f"Form document generation failed with unexpected error: {error_msg}")

        if document:
            document.status = FormDocument.STATUS_ERROR
            document.error_message = error_msg
            document.save()

        # Re-raise for Celery retry
        raise


@shared_task
def cleanup_old_pending_documents():
    """
    Periodic task to clean up old pending documents that never completed.
    Run this via Celery Beat (e.g., daily).
    """
    from datetime import timedelta
    from django.utils import timezone
    from .models import FormDocument

    threshold = timezone.now() - timedelta(hours=24)

    old_pending = FormDocument.objects.filter(
        status=FormDocument.STATUS_PENDING,
        generated_at__lt=threshold
    )

    count = old_pending.count()

    if count > 0:
        old_pending.update(
            status=FormDocument.STATUS_ERROR,
            error_message='Generation timed out or failed to complete'
        )
        logger.info(f"Marked {count} old pending documents as error")

    return {'cleaned': count}
