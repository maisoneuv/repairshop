"""
Celery tasks for reliable email delivery.

Outbound tenant→customer emails are persisted first (EmailMessage + EmailAttachment),
then sent asynchronously with automatic retries. Inbound replies are forwarded
to the tenant's real inbox.
"""
import logging

import requests
from anymail.exceptions import AnymailAPIError, AnymailRecipientsRefused
from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

logger = logging.getLogger(__name__)

RETRYABLE_EXCEPTIONS = (AnymailAPIError, requests.RequestException, OSError)


def _provider_message_id(msg):
    """Extract the ESP message id after a send (console/SMTP backends have no anymail_status)."""
    anymail_status = getattr(msg, 'anymail_status', None)
    return (anymail_status and anymail_status.message_id) or ''


@shared_task(
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=60,
    retry_backoff_max=3600,
    retry_jitter=True,
    max_retries=settings.EMAIL_SEND_MAX_RETRIES,
)
def send_email_message(self, email_message_id):
    """Send a queued outbound EmailMessage. Safe to run multiple times (idempotent via status)."""
    from .email_utils import build_customer_message
    from .models import EmailMessage

    try:
        email = EmailMessage.objects.select_related('tenant').get(pk=email_message_id)
    except EmailMessage.DoesNotExist:
        logger.warning("send_email_message: EmailMessage %s no longer exists", email_message_id)
        return

    # Idempotency guard: only queued (fresh or re-enqueued after retryable failure)
    # or sending (stale crash recovery via retry) rows may be sent.
    if email.status not in ('queued', 'sending'):
        logger.info("send_email_message: EmailMessage %s already %s, skipping", email.pk, email.status)
        return

    email.status = 'sending'
    email.save(update_fields=['status'])

    msg = None
    try:
        # Building can fail too (e.g. unreadable attachment) — keep it inside the
        # try so the row never gets stuck in 'sending'.
        msg = build_customer_message(email)
        email.from_email = msg.from_email
        msg.send(fail_silently=False)
    except AnymailRecipientsRefused as exc:
        # Permanent failure (invalid/suppressed recipient) — do not retry.
        email.status = 'failed'
        email.error_message = str(exc)
        email.save(update_fields=['status', 'error_message', 'from_email'])
        logger.warning("Email %s permanently refused: %s", email.pk, exc)
        return
    except RETRYABLE_EXCEPTIONS as exc:
        email.error_message = str(exc)
        if self.request.retries >= self.max_retries:
            email.status = 'failed'
            email.save(update_fields=['status', 'error_message', 'from_email'])
            logger.error("Email %s failed after %s retries: %s", email.pk, self.request.retries, exc)
            return
        email.status = 'queued'  # back to queued so the retry passes the idempotency guard
        email.save(update_fields=['status', 'error_message', 'from_email'])
        raise  # autoretry_for schedules the retry with backoff
    except Exception as exc:
        # Unexpected error (bad payload, template issue, …) — permanent.
        email.status = 'failed'
        email.error_message = str(exc)
        email.save(update_fields=['status', 'error_message', 'from_email'])
        logger.exception("Email %s failed with non-retryable error", email.pk)
        return

    email.status = 'sent'
    email.sent_at = timezone.now()
    email.error_message = ''
    email.provider_message_id = _provider_message_id(msg)
    email.save(update_fields=['status', 'sent_at', 'error_message', 'provider_message_id', 'from_email'])
    logger.info("Email %s sent (provider id: %s)", email.pk, email.provider_message_id or 'n/a')


@shared_task(
    bind=True,
    autoretry_for=RETRYABLE_EXCEPTIONS,
    retry_backoff=60,
    retry_backoff_max=3600,
    retry_jitter=True,
    max_retries=settings.EMAIL_SEND_MAX_RETRIES,
)
def forward_inbound_email(self, email_message_id):
    """Forward a copy of an inbound customer reply to the tenant's real inbox."""
    from .models import EmailMessage

    try:
        email = EmailMessage.objects.select_related('tenant').get(pk=email_message_id, direction='inbound')
    except EmailMessage.DoesNotExist:
        logger.warning("forward_inbound_email: inbound EmailMessage %s not found", email_message_id)
        return

    try:
        email_settings = email.tenant.email_settings
    except Exception:
        email_settings = None
    forward_to = email_settings.reply_forward_email if email_settings else ''
    if not forward_to:
        logger.info("forward_inbound_email: tenant %s has no reply_forward_email, skipping", email.tenant_id)
        return

    subject = email.subject or '(no subject)'
    thread_link = ''
    if email.content_type.model == 'workitem':
        thread_link = f"{settings.FRONTEND_BASE_URL}/work-items/{email.object_id}"
    link_line = f"View the conversation: {thread_link}\n\n" if thread_link else ""
    intro = (
        f"{email.from_email} replied to your email.\n\n"
        f"{link_line}"
        "----------\n\n"
    )
    msg = EmailMultiAlternatives(
        subject=subject,
        body=intro + (email.body_text or ''),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[forward_to],
        # Reply-To is the customer, so tenant staff can answer straight from their inbox.
        reply_to=[email.from_email] if email.from_email else None,
    )
    if email.body_html:
        link_html = f' <a href="{thread_link}">View the conversation</a>' if thread_link else ''
        html = (
            f'<p><strong>{email.from_email}</strong> replied to your email.{link_html}</p><hr>'
            + email.body_html
        )
        msg.attach_alternative(html, "text/html")

    for attachment in email.attachments.all():
        with attachment.file.open('rb') as fobj:
            msg.attach(attachment.filename, fobj.read(), attachment.mime_type or 'application/octet-stream')

    msg.send(fail_silently=False)
    logger.info("Forwarded inbound email %s to %s", email.pk, forward_to)
