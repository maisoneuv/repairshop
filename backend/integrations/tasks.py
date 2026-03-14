"""
Celery tasks for handling integration webhooks and external API calls.
These tasks are called asynchronously after database commits to ensure data consistency.
"""
import json
import logging
import time
from typing import Dict, Any, Tuple

import requests
from celery import shared_task
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

MAX_WEBHOOK_RETRIES = 3
MAX_PAYLOAD_SIZE = 65536  # 64KB

logger = logging.getLogger(__name__)


def sanitize_headers(headers: Dict[str, str]) -> Dict[str, str]:
    """Remove sensitive values from headers for logging."""
    sensitive_keys = ['authorization', 'x-api-key', 'api-key', 'x-auth-token']
    sanitized = {}
    for key, value in headers.items():
        if key.lower() in sensitive_keys:
            sanitized[key] = '[REDACTED]'
        else:
            sanitized[key] = value
    return sanitized


def truncate_payload(data: Any, max_size: int = MAX_PAYLOAD_SIZE) -> Tuple[Any, bool]:
    """Truncate payload if too large. Returns (data, was_truncated)."""
    if data is None:
        return None, False
    try:
        serialized = json.dumps(data)
        if len(serialized) > max_size:
            return {'_truncated': True, '_original_size': len(serialized)}, True
    except (TypeError, ValueError):
        pass
    return data, False


@shared_task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_kwargs={'max_retries': MAX_WEBHOOK_RETRIES, 'countdown': 60},
    retry_backoff=True,  # Exponential backoff
    retry_jitter=True,  # Add random jitter to avoid thundering herd
    max_retries=MAX_WEBHOOK_RETRIES,
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
        # Resolve content type and related model
        content_type = ContentType.objects.get(id=content_type_id)
        model_class = content_type.model_class()

        is_summary_request = (
            event_type == 'workitem_summary_requested' and
            model_class is not None and
            content_type.model == 'workitem'
        )

        def mark_summary_failed(reason):
            """Mark the work item summary as failed when integration cannot run."""
            if not is_summary_request or model_class is None:
                return
            try:
                workitem = model_class.objects.get(pk=object_id)
            except model_class.DoesNotExist:
                logger.warning(
                    "Unable to mark summary failed for %s:%s - object missing",
                    content_type.model,
                    object_id
                )
                return

            if workitem.summary_status != 'pending':
                return

            workitem.summary_status = 'failed'
            workitem.save(update_fields=['summary_status'])
            logger.error(
                "Marked summary as failed for WorkItem %s due to integration error: %s",
                getattr(workitem, 'reference_id', workitem.pk),
                reason
            )

        # Get the integration configuration
        integration = TenantIntegration.objects.get(id=integration_id)

        if not integration.is_active:
            logger.info(f"Integration {integration.name} is inactive, skipping webhook")
            mark_summary_failed("Integration inactive")
            return

        # For creation events, use get_or_create (idempotent)
        # For all other events (updates, status changes, etc.), create a new sync record each time
        if event_type.endswith('_created'):
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
        else:
            # All other events: create a new sync record each time
            sync_record = IntegrationSync.objects.create(
                integration=integration,
                content_type=content_type,
                object_id=object_id,
                event_type=event_type,
                status='pending',
                request_payload=payload
            )
            created = True

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

        from integrations.models import IntegrationRequestLog

        start_time = time.time()
        response = None
        response_data = None

        try:
            response = requests.post(
                integration.webhook_url,
                json=payload,
                headers=headers,
                timeout=30  # 30 second timeout
            )
            response_time_ms = int((time.time() - start_time) * 1000)

            # Parse response
            try:
                response_data = response.json()
            except json.JSONDecodeError:
                response_data = {'raw_response': response.text}

            # Truncate payloads if needed
            request_body, req_truncated = truncate_payload(payload)
            response_body, resp_truncated = truncate_payload(response_data)

            # Create log entry
            IntegrationRequestLog.objects.create(
                tenant=integration.tenant,
                direction='outbound',
                method='POST',
                url=integration.webhook_url,
                request_headers=sanitize_headers(headers),
                request_body=request_body,
                request_body_truncated=req_truncated,
                response_status_code=response.status_code,
                response_headers=dict(response.headers),
                response_body=response_body,
                response_body_truncated=resp_truncated,
                success=response.ok,
                response_time_ms=response_time_ms,
                integration=integration,
                integration_sync=sync_record,
                retry_number=self.request.retries,
            )

            response.raise_for_status()  # Raise exception for 4xx/5xx status codes

        except requests.RequestException as inner_exc:
            # Log failed request if we haven't logged yet (e.g., connection error before response)
            response_time_ms = int((time.time() - start_time) * 1000)
            if response is None:
                request_body, req_truncated = truncate_payload(payload)
                IntegrationRequestLog.objects.create(
                    tenant=integration.tenant,
                    direction='outbound',
                    method='POST',
                    url=integration.webhook_url,
                    request_headers=sanitize_headers(headers),
                    request_body=request_body,
                    request_body_truncated=req_truncated,
                    response_status_code=None,
                    success=False,
                    error_message=str(inner_exc),
                    response_time_ms=response_time_ms,
                    integration=integration,
                    integration_sync=sync_record,
                    retry_number=self.request.retries,
                )
            raise

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

        mark_summary_failed(error_msg)

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
        if 'mark_summary_failed' in locals():
            mark_summary_failed('Integration configuration missing')
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

        mark_summary_failed(error_msg)

        # System notes removed - check IntegrationSync table in admin for error details
        # if 'obj' not in locals():
        #     obj = content_type.get_object_for_this_type(pk=object_id)
        # create_system_note(
        #     obj,
        #     f"✗ Integration sync error: {integration.name} - {error_msg}"
        # )

        return {'status': 'error', 'message': error_msg}


@shared_task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_kwargs={'max_retries': 3, 'countdown': 30},
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def execute_custom_action(self, action_id: int, target_id=None, user_input: str = ''):
    """
    Execute a custom action by sending an HTTP POST to the configured webhook URL.
    Includes the full record payload (WorkItem or Task) plus the user-entered text.
    """
    from integrations.models import CustomAction, IntegrationRequestLog

    try:
        action = CustomAction.objects.get(id=action_id, is_active=True)
    except CustomAction.DoesNotExist:
        logger.error(f"CustomAction {action_id} not found or inactive")
        return {'status': 'error', 'message': 'Action not found'}

    # Build record payload
    try:
        if action.target == 'global':
            payload = {}
        elif action.include_record_details:
            if action.target == 'workitem':
                from tasks.models import WorkItem
                from integrations.signals.workitem import build_workitem_payload
                record = WorkItem.objects.get(pk=target_id, tenant=action.tenant)
                payload = build_workitem_payload(record, 'custom_action')
            else:
                from tasks.models import Task
                from integrations.signals.task import build_task_payload
                record = Task.objects.get(pk=target_id, tenant=action.tenant)
                payload = build_task_payload(record, 'custom_action')
        else:
            payload = {action.target: {'id': target_id}}
    except Exception as exc:
        logger.error(f"Failed to build payload for custom action {action_id}: {exc}")
        return {'status': 'error', 'message': f'Failed to load record: {exc}'}

    payload['event_type'] = 'custom_action'
    payload['action'] = {'id': action.id, 'name': action.name}
    payload['user_input'] = user_input

    # Prepare headers
    headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'FixedService-Integration/1.0',
    }
    if action.headers:
        headers.update(action.headers)

    logger.info(
        f"Executing custom action '{action.name}' for {action.target}:{target_id} "
        f"(attempt {self.request.retries + 1})"
    )

    start_time = time.time()
    response = None
    response_data = None

    try:
        response = requests.post(
            action.webhook_url,
            json=payload,
            headers=headers,
            timeout=30,
        )
        response_time_ms = int((time.time() - start_time) * 1000)

        try:
            response_data = response.json()
        except json.JSONDecodeError:
            response_data = {'raw_response': response.text}

        request_body, req_truncated = truncate_payload(payload)
        response_body, resp_truncated = truncate_payload(response_data)

        IntegrationRequestLog.objects.create(
            tenant=action.tenant,
            direction='outbound',
            method='POST',
            url=action.webhook_url,
            request_headers=sanitize_headers(headers),
            request_body=request_body,
            request_body_truncated=req_truncated,
            response_status_code=response.status_code,
            response_headers=dict(response.headers),
            response_body=response_body,
            response_body_truncated=resp_truncated,
            success=response.ok,
            response_time_ms=response_time_ms,
            integration=None,
            integration_sync=None,
            retry_number=self.request.retries,
        )

        response.raise_for_status()

    except requests.RequestException as exc:
        response_time_ms = int((time.time() - start_time) * 1000)
        if response is None:
            request_body, req_truncated = truncate_payload(payload)
            IntegrationRequestLog.objects.create(
                tenant=action.tenant,
                direction='outbound',
                method='POST',
                url=action.webhook_url,
                request_headers=sanitize_headers(headers),
                request_body=request_body,
                request_body_truncated=req_truncated,
                response_status_code=None,
                success=False,
                error_message=str(exc),
                response_time_ms=response_time_ms,
                integration=None,
                integration_sync=None,
                retry_number=self.request.retries,
            )
        raise

    logger.info(f"Custom action '{action.name}' completed successfully for {action.target}:{target_id}")
    return {'status': 'success', 'action': action.name}


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


@shared_task
def cleanup_old_integration_logs(success_days=30, failed_days=90):
    """
    Periodic task to clean up old integration request logs.
    Can be scheduled with Celery Beat (e.g., daily at 3 AM).

    Args:
        success_days: Retention days for successful requests (default: 30)
        failed_days: Retention days for failed requests (default: 90)
    """
    from datetime import timedelta
    from integrations.models import IntegrationRequestLog

    now = timezone.now()

    # Delete old successful logs
    success_deleted, _ = IntegrationRequestLog.objects.filter(
        success=True,
        timestamp__lt=now - timedelta(days=success_days)
    ).delete()

    # Delete old failed logs
    failed_deleted, _ = IntegrationRequestLog.objects.filter(
        success=False,
        timestamp__lt=now - timedelta(days=failed_days)
    ).delete()

    total = success_deleted + failed_deleted
    logger.info(f"Cleaned up {total} integration logs ({success_deleted} success, {failed_deleted} failed)")

    return {
        'success_deleted': success_deleted,
        'failed_deleted': failed_deleted,
        'total': total,
    }
