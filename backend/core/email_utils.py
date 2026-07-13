import secrets

from django.conf import settings
from django.core.mail import EmailMessage, EmailMultiAlternatives
from django.utils.html import strip_tags


def send_system_email(subject, body, to_email):
    """Send a system/platform email (password reset, invitations, etc.) from the platform's own address."""
    EmailMessage(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    ).send(fail_silently=False)


def new_reply_token():
    """Generate a reply-token safe for plus-addressing (reply+<token>@REPLY_DOMAIN)."""
    return secrets.token_urlsafe(12).lower()


def resolve_sender(tenant):
    """Return the From header for tenant→customer email.

    White-label path: only when the tenant's custom domain is ESP-verified
    (SPF/DKIM via the Resend Domains API) AND from_email is on that domain —
    otherwise the ESP would reject the send or it would fail DMARC.
    Default path: always-deliverable platform address <slug>@PLATFORM_EMAIL_DOMAIN.
    """
    try:
        email_settings = tenant.email_settings
    except Exception:
        email_settings = None

    display_name = (email_settings.from_name if email_settings else '') or tenant.name

    if (
        email_settings
        and email_settings.domain_status == 'verified'
        and email_settings.from_email
        and email_settings.custom_domain
        and email_settings.from_email.rsplit('@', 1)[-1].lower() == email_settings.custom_domain.lower()
    ):
        return f"{display_name} <{email_settings.from_email}>"

    slug = (email_settings.sending_slug if email_settings else '') or tenant.subdomain
    return f"{display_name} <{slug}@{settings.PLATFORM_EMAIL_DOMAIN}>"


def build_reply_to(reply_token):
    """Reply-To address that routes customer replies back into the app thread."""
    return f"reply+{reply_token}@{settings.PLATFORM_REPLY_DOMAIN}"


def build_customer_message(email_message):
    """Build an EmailMultiAlternatives for an outbound EmailMessage DB row.

    Attachments are read from storage (EmailAttachment rows), so this works
    from a Celery worker as long as it shares the media volume.
    """
    tenant = email_message.tenant
    plain_text = email_message.body_text or strip_tags(email_message.body_html)
    reply_to = [build_reply_to(email_message.reply_token)] if email_message.reply_token else None

    msg = EmailMultiAlternatives(
        subject=email_message.subject,
        body=plain_text,
        from_email=resolve_sender(tenant),
        to=[email_message.to_email],
        cc=list(email_message.cc_emails or []),
        reply_to=reply_to,
    )
    msg.attach_alternative(email_message.body_html, "text/html")

    for attachment in email_message.attachments.all():
        with attachment.file.open('rb') as fobj:
            msg.attach(attachment.filename, fobj.read(), attachment.mime_type or 'application/octet-stream')

    return msg
