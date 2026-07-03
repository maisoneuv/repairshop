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


def send_customer_email(tenant, subject, body, to_email):
    """Send a plain-text email to a customer on behalf of a tenant."""
    from_email, reply_to = _resolve_from(tenant)
    msg = EmailMessage(
        subject=subject,
        body=body,
        from_email=from_email,
        to=[to_email],
        reply_to=reply_to,
    )
    msg.send(fail_silently=False)


def send_customer_email_html(tenant, subject, body_html, body_text, to_email,
                             cc_emails=None, attachments=None):
    """Send an HTML email to a customer on behalf of a tenant.

    attachments: optional list of (filename, content_bytes, mime_type) tuples.
    """
    from_email, reply_to = _resolve_from(tenant)
    plain_text = body_text or strip_tags(body_html)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=plain_text,
        from_email=from_email,
        to=[to_email],
        cc=list(cc_emails) if cc_emails else [],
        reply_to=reply_to,
    )
    msg.attach_alternative(body_html, "text/html")

    for filename, content, mime_type in (attachments or []):
        msg.attach(filename, content, mime_type or 'application/octet-stream')

    msg.send(fail_silently=False)


def _resolve_from(tenant):
    """Return (from_email_str, reply_to_list) for a tenant."""
    try:
        email_settings = tenant.email_settings
    except Exception:
        email_settings = None

    if email_settings and email_settings.is_verified and email_settings.from_email:
        from_name = email_settings.from_name or tenant.name
        return f"{from_name} <{email_settings.from_email}>", None

    reply_to = [email_settings.from_email] if email_settings and email_settings.from_email else None
    return settings.DEFAULT_FROM_EMAIL, reply_to
