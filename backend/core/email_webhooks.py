"""
Anymail signal receivers for Resend webhooks.

- tracking: delivery/bounce/complaint events -> update EmailMessage status
- inbound:  customer replies to reply+<token>@PLATFORM_REPLY_DOMAIN -> create an
  inbound EmailMessage in the same work-item thread and forward a copy to the tenant.

Connected in core.apps.CoreConfig.ready().
"""
import logging
import re

import nh3
from anymail.signals import inbound, tracking
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.dispatch import receiver
from django.utils import timezone

logger = logging.getLogger(__name__)

# Only ever move status forward (a late "sent" event must not overwrite "delivered").
_STATUS_RANK = {
    'queued': 0,
    'sending': 1,
    'sent': 2,
    'delivered': 3,
    'bounced': 4,
    'complained': 4,
    'failed': 4,
}

_REPLY_ADDRESS_RE = re.compile(r'reply\+([a-z0-9_-]+)@', re.IGNORECASE)


@receiver(tracking)
def handle_tracking_event(sender, event, esp_name, **kwargs):
    """Update outbound EmailMessage delivery state from ESP tracking events."""
    from .models import EmailMessage

    if not event.message_id:
        return

    email = EmailMessage.objects.filter(
        provider_message_id=event.message_id, direction='outbound',
    ).first()
    if email is None:
        logger.warning("Tracking event %s for unknown message id %s", event.event_type, event.message_id)
        return

    new_status = None
    if event.event_type == 'delivered':
        new_status = 'delivered'
        email.delivered_at = event.timestamp or timezone.now()
    elif event.event_type in ('bounced', 'rejected', 'failed'):
        new_status = 'bounced' if event.event_type == 'bounced' else 'failed'
        email.error_message = event.description or event.reject_reason or event.event_type
    elif event.event_type == 'complained':
        new_status = 'complained'
        email.error_message = event.description or 'Recipient marked the email as spam'
    # 'queued'/'sent'/'deferred'/'opened'/'clicked' — no status change

    if new_status and _STATUS_RANK.get(new_status, 0) > _STATUS_RANK.get(email.status, 0):
        email.status = new_status
        email.save(update_fields=['status', 'delivered_at', 'error_message'])
        logger.info("Email %s -> %s (tracking)", email.pk, new_status)


def _extract_reply_token(message, event):
    """Find our reply+<token> address among the recipients (headers + envelope)."""
    candidates = []
    for addr in list(message.to or []) + list(message.cc or []):
        candidates.append(addr.addr_spec)
    esp_event = getattr(event, 'esp_event', None) or {}
    data = esp_event.get('data', esp_event) if isinstance(esp_event, dict) else {}
    for value in (data.get('to') or []):
        candidates.append(str(value))

    reply_domain = settings.PLATFORM_REPLY_DOMAIN.lower()
    for candidate in candidates:
        candidate = candidate.lower()
        if reply_domain in candidate:
            match = _REPLY_ADDRESS_RE.search(candidate)
            if match:
                return match.group(1)
    return None


@receiver(inbound)
def handle_inbound_email(sender, event, esp_name, **kwargs):
    """Capture a customer reply into the app thread and forward a copy to the tenant."""
    from .models import EmailAttachment, EmailMessage
    from .tasks import forward_inbound_email

    message = event.message
    from_addr = message.from_email.addr_spec if message.from_email else ''

    # Loop guard: never ingest mail originating from our own sending/reply domains.
    from_domain = from_addr.rsplit('@', 1)[-1].lower() if '@' in from_addr else ''
    if from_domain in (settings.PLATFORM_REPLY_DOMAIN.lower(), settings.PLATFORM_EMAIL_DOMAIN.lower()):
        logger.warning("Dropping inbound email from own domain: %s", from_addr)
        return

    token = _extract_reply_token(message, event)
    if not token:
        logger.warning("Inbound email from %s had no reply token; ignoring", from_addr)
        return

    parent = EmailMessage.objects.filter(reply_token=token, direction='outbound').first()
    if parent is None:
        logger.warning("Inbound email from %s: no outbound message for token %s", from_addr, token)
        return

    message_id_header = message['Message-ID'] or ''
    if message_id_header and EmailMessage.objects.filter(
        in_reply_to=parent, direction='inbound', message_id_header=message_id_header,
    ).exists():
        logger.info("Duplicate inbound delivery for %s, skipping", message_id_header)
        return

    # Customer-controlled HTML is rendered in the app — sanitize server-side.
    body_html = nh3.clean(message.html) if message.html else ''

    with transaction.atomic():
        inbound_email = EmailMessage.objects.create(
            tenant=parent.tenant,
            author=None,
            direction='inbound',
            status='received',
            from_email=from_addr,
            to_email=f"reply+{token}@{settings.PLATFORM_REPLY_DOMAIN}",
            subject=message.subject or '',
            body_html=body_html,
            body_text=message.text or '',
            in_reply_to=parent,
            message_id_header=message_id_header,
            content_type=parent.content_type,
            object_id=parent.object_id,
        )

        for attachment in message.attachments:
            filename = attachment.get_filename() or 'attachment'
            content = attachment.get_content_bytes() or b''
            EmailAttachment.objects.create(
                email=inbound_email,
                file=ContentFile(content, name=filename),
                filename=filename,
                mime_type=attachment.get_content_type() or '',
                size=len(content),
            )

        transaction.on_commit(lambda: forward_inbound_email.delay(inbound_email.id))

    logger.info("Inbound reply %s captured for outbound email %s", inbound_email.pk, parent.pk)
