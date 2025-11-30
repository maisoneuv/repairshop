"""
Celery tasks for handling integration webhooks and external API calls.
These tasks are called asynchronously after database commits to ensure data consistency.
"""
import json
import logging
from datetime import datetime
from typing import Dict, Any

import requests
from celery import shared_task
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_kwargs={'max_retries': 3, 'countdown': 60},  # Retry up to 3 times, wait 60s between retries
    retry_backoff=True,  # Exponential backoff
    retry_jitter=True,  # Add random jitter to avoid thundering herd
)
def send_integration_webhook(
    self,
    integration_id: int,
    content_type_id: int,
    object_id: int,
    event_type: str,
    payload: Dict[str, Any]
):
    """
    Send data to an integration webhook (n8n, Zapier, etc.).

    This task is designed to be idempotent and includes automatic retry logic.

    Args:
        integration_id: ID of the TenantIntegration
        content_type_id: ContentType ID of the object being synced
        object_id: ID of the object being synced
        event_type: Type of event (workitem_created, workitem_updated, etc.)
        payload: Data to send to the webhook
    """
    from integrations.models import TenantIntegration, IntegrationSync

    try:
        # Get the integration configuration
        integration = TenantIntegration.objects.get(id=integration_id)

        if not integration.is_active:
            logger.info(f"Integration {integration.name} is inactive, skipping webhook")
            return

        # Get or create the sync record
        content_type = ContentType.objects.get(id=content_type_id)

        # For update events, always create a new sync record (not idempotent)
        # For creation events, use get_or_create (idempotent)
        if event_type in ['workitem_updated', 'workitem_status_changed', 'task_updated']:
            # Update events: create a new sync record each time
            sync_record = IntegrationSync.objects.create(
                integration=integration,
                content_type=content_type,
                object_id=object_id,
                event_type=event_type,
                status='pending',
                request_payload=payload
            )
            created = True
        else:
            # Creation events: use get_or_create for idempotency
            sync_record, created = IntegrationSync.objects.get_or_create(
                integration=integration,
                content_type=content_type,
                object_id=object_id,
                event_type=event_type,
                defaults={
                    'status': 'pending',
                    'request_payload': payload
                }
            )

            # If already synced successfully, skip (idempotency for creation events)
            if sync_record.status == 'synced' and not created:
                logger.info(
                    f"Object {content_type.model}:{object_id} already synced "
                    f"for event {event_type}, skipping"
                )
                return

        # Update retry count
        sync_record.retry_count = self.request.retries
        sync_record.last_attempt_at = timezone.now()
        sync_record.request_payload = payload
        sync_record.save(update_fields=['retry_count', 'last_attempt_at', 'request_payload'])

        # Prepare headers
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'FixedService-Integration/1.0'
        }

        # Add custom headers from integration config
        if integration.headers:
            headers.update(integration.headers)

        # Make the HTTP request
        logger.info(
            f"Sending webhook to {integration.name} for {content_type.model}:{object_id} "
            f"(attempt {self.request.retries + 1})"
        )

        response = requests.post(
            integration.webhook_url,
            json=payload,
            headers=headers,
            timeout=30  # 30 second timeout
        )

        response.raise_for_status()  # Raise exception for 4xx/5xx status codes

        # Parse response
        try:
            response_data = response.json()
        except json.JSONDecodeError:
            response_data = {'raw_response': response.text}

        # Update sync record with success
        sync_record.status = 'synced'
        sync_record.synced_at = timezone.now()
        sync_record.response_data = response_data
        sync_record.last_error = None

        # Extract external ID if provided in response
        if isinstance(response_data, dict) and 'id' in response_data:
            sync_record.external_id = str(response_data['id'])

        sync_record.save()

        # System notes removed - check IntegrationSync table in admin for sync history
        # obj = content_type.get_object_for_this_type(pk=object_id)
        # create_system_note(
        #     obj,
        #     f"✓ Integration sync successful: {integration.name} ({event_type})"
        # )

        logger.info(
            f"Successfully synced {content_type.model}:{object_id} "
            f"to {integration.name}"
        )

        return {
            'status': 'success',
            'integration': integration.name,
            'object': f"{content_type.model}:{object_id}",
            'external_id': sync_record.external_id
        }

    except requests.RequestException as exc:
        # Network/HTTP errors - will be retried automatically
        error_msg = f"Request failed: {str(exc)}"
        logger.warning(
            f"Webhook request failed for {content_type.model}:{object_id} "
            f"(attempt {self.request.retries + 1}/3): {error_msg}"
        )

        # Update sync record with error
        if 'sync_record' in locals():
            sync_record.status = 'failed'
            sync_record.last_error = error_msg
            sync_record.save(update_fields=['status', 'last_error'])

        # System notes removed - check IntegrationSync table in admin for failure details
        # if self.request.retries >= 2:  # 0, 1, 2 = 3 attempts
        #     if 'obj' not in locals():
        #         obj = content_type.get_object_for_this_type(pk=object_id)
        #     create_system_note(
        #         obj,
        #         f"✗ Integration sync failed after 3 attempts: {integration.name} - {error_msg}"
        #     )

        # Re-raise to trigger Celery's retry mechanism
        raise

    except TenantIntegration.DoesNotExist:
        logger.error(f"TenantIntegration {integration_id} not found")
        return {'status': 'error', 'message': 'Integration not found'}

    except Exception as exc:
        # Unexpected errors - log and fail without retry
        error_msg = f"Unexpected error: {type(exc).__name__}: {str(exc)}"
        logger.exception(
            f"Unexpected error sending webhook for {content_type.model}:{object_id}"
        )

        # Update sync record with error
        if 'sync_record' in locals():
            sync_record.status = 'failed'
            sync_record.last_error = error_msg
            sync_record.save(update_fields=['status', 'last_error'])

        # System notes removed - check IntegrationSync table in admin for error details
        # if 'obj' not in locals():
        #     obj = content_type.get_object_for_this_type(pk=object_id)
        # create_system_note(
        #     obj,
        #     f"✗ Integration sync error: {integration.name} - {error_msg}"
        # )

        return {'status': 'error', 'message': error_msg}


@shared_task
def retry_failed_syncs(max_retries=3):
    """
    Periodic task to retry failed integration syncs.
    Can be scheduled with Celery Beat.
    """
    from integrations.models import IntegrationSync

    failed_syncs = IntegrationSync.objects.filter(
        status='failed',
        retry_count__lt=max_retries
    )

    logger.info(f"Found {failed_syncs.count()} failed syncs to retry")

    for sync in failed_syncs:
        # Re-enqueue the webhook task
        send_integration_webhook.delay(
            integration_id=sync.integration_id,
            content_type_id=sync.content_type_id,
            object_id=sync.object_id,
            event_type=sync.event_type,
            payload=sync.request_payload or {}
        )

    return {
        'retried_count': failed_syncs.count()
    }
