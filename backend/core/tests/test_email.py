from unittest.mock import patch

from anymail.inbound import AnymailInboundMessage
from anymail.signals import AnymailInboundEvent, AnymailTrackingEvent
from django.contrib.contenttypes.models import ContentType
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from core.email_utils import build_reply_to, new_reply_token, resolve_sender
from core.email_webhooks import handle_inbound_email, handle_tracking_event
from core.models import EmailMessage
from core.tasks import send_email_message
from tenants.models import Tenant, TenantEmailSettings

EMAIL_OVERRIDES = dict(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    PLATFORM_EMAIL_DOMAIN='mail.platform.test',
    PLATFORM_REPLY_DOMAIN='reply.platform.test',
)


def make_tenant(**kwargs):
    return Tenant.objects.create(name=kwargs.pop('name', 'Repair Hero'),
                                 subdomain=kwargs.pop('subdomain', 'repairhero'), **kwargs)


def make_outbound(tenant, **kwargs):
    defaults = dict(
        tenant=tenant,
        direction='outbound',
        to_email='customer@example.com',
        subject='Your repair',
        body_html='<p>Hello</p>',
        status='queued',
        reply_token=new_reply_token(),
        content_type=ContentType.objects.get_for_model(Tenant),
        object_id=tenant.id,
    )
    defaults.update(kwargs)
    return EmailMessage.objects.create(**defaults)


@override_settings(**EMAIL_OVERRIDES)
class ResolveSenderTests(TestCase):
    def test_no_email_settings_uses_platform_default(self):
        tenant = make_tenant()
        self.assertEqual(resolve_sender(tenant), 'Repair Hero <repairhero@mail.platform.test>')

    def test_sending_slug_and_from_name(self):
        tenant = make_tenant()
        TenantEmailSettings.objects.create(tenant=tenant, from_name='Best Repairs', sending_slug='best')
        self.assertEqual(resolve_sender(tenant), 'Best Repairs <best@mail.platform.test>')

    def test_verified_custom_domain(self):
        tenant = make_tenant()
        TenantEmailSettings.objects.create(
            tenant=tenant, from_name='Andrzej', from_email='andrzej@repairhero.com',
            custom_domain='repairhero.com', domain_status='verified',
        )
        self.assertEqual(resolve_sender(tenant), 'Andrzej <andrzej@repairhero.com>')

    def test_unverified_domain_falls_back_to_platform(self):
        tenant = make_tenant()
        TenantEmailSettings.objects.create(
            tenant=tenant, from_email='andrzej@repairhero.com',
            custom_domain='repairhero.com', domain_status='pending',
        )
        self.assertEqual(resolve_sender(tenant), 'Repair Hero <repairhero@mail.platform.test>')

    def test_verified_domain_with_mismatched_address_falls_back(self):
        tenant = make_tenant()
        TenantEmailSettings.objects.create(
            tenant=tenant, from_email='andrzej@otherdomain.com',
            custom_domain='repairhero.com', domain_status='verified',
        )
        self.assertEqual(resolve_sender(tenant), 'Repair Hero <repairhero@mail.platform.test>')


@override_settings(**EMAIL_OVERRIDES)
class SendEmailTaskTests(TestCase):
    def test_successful_send_marks_sent_and_sets_reply_to(self):
        email = make_outbound(make_tenant())
        send_email_message.apply(args=[email.id])

        email.refresh_from_db()
        self.assertEqual(email.status, 'sent')
        self.assertIsNotNone(email.sent_at)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].reply_to, [build_reply_to(email.reply_token)])
        self.assertEqual(mail.outbox[0].from_email, 'Repair Hero <repairhero@mail.platform.test>')

    def test_idempotency_guard_skips_already_sent(self):
        email = make_outbound(make_tenant(), status='sent', sent_at=timezone.now())
        send_email_message.apply(args=[email.id])
        self.assertEqual(len(mail.outbox), 0)

    def test_unexpected_error_marks_failed(self):
        email = make_outbound(make_tenant())
        # build_customer_message is imported inside the task, so patch the source module.
        with patch('core.email_utils.build_customer_message', side_effect=ValueError('boom')):
            send_email_message.apply(args=[email.id])
        email.refresh_from_db()
        self.assertEqual(email.status, 'failed')
        self.assertIn('boom', email.error_message)


@override_settings(**EMAIL_OVERRIDES)
class TrackingWebhookTests(TestCase):
    def _event(self, event_type, message_id, **kwargs):
        return AnymailTrackingEvent(event_type=event_type, message_id=message_id,
                                    timestamp=timezone.now(), **kwargs)

    def test_delivered_event_updates_status(self):
        email = make_outbound(make_tenant(), status='sent', provider_message_id='resend-id-1')
        handle_tracking_event(sender=None, event=self._event('delivered', 'resend-id-1'), esp_name='Resend')
        email.refresh_from_db()
        self.assertEqual(email.status, 'delivered')
        self.assertIsNotNone(email.delivered_at)

    def test_bounced_event_records_error(self):
        email = make_outbound(make_tenant(), status='sent', provider_message_id='resend-id-2')
        handle_tracking_event(sender=None,
                              event=self._event('bounced', 'resend-id-2', description='mailbox full'),
                              esp_name='Resend')
        email.refresh_from_db()
        self.assertEqual(email.status, 'bounced')
        self.assertEqual(email.error_message, 'mailbox full')

    def test_late_sent_event_does_not_downgrade_delivered(self):
        email = make_outbound(make_tenant(), status='delivered', provider_message_id='resend-id-3')
        handle_tracking_event(sender=None, event=self._event('sent', 'resend-id-3'), esp_name='Resend')
        email.refresh_from_db()
        self.assertEqual(email.status, 'delivered')

    def test_unknown_message_id_is_ignored(self):
        handle_tracking_event(sender=None, event=self._event('delivered', 'nope'), esp_name='Resend')


@override_settings(**EMAIL_OVERRIDES)
class InboundWebhookTests(TestCase):
    def _inbound_event(self, to_addr, from_addr='customer@example.com', message_id='<msg-1@example.com>',
                       html='<p>Thanks!</p><script>alert(1)</script>'):
        message = AnymailInboundMessage.construct(
            from_email=from_addr, to=to_addr, subject='Re: Your repair',
            text='Thanks!', html=html, headers={'Message-ID': message_id},
        )
        return AnymailInboundEvent(event_type='inbound', message=message)

    def test_reply_creates_inbound_message_in_thread(self):
        parent = make_outbound(make_tenant(), status='sent')
        event = self._inbound_event(f'reply+{parent.reply_token}@reply.platform.test')

        with patch('core.tasks.forward_inbound_email.delay') as mock_forward, \
             self.captureOnCommitCallbacks(execute=True):
            handle_inbound_email(sender=None, event=event, esp_name='Resend')

        inbound_msg = EmailMessage.objects.get(direction='inbound')
        self.assertEqual(inbound_msg.in_reply_to_id, parent.id)
        self.assertEqual(inbound_msg.tenant_id, parent.tenant_id)
        self.assertEqual(inbound_msg.status, 'received')
        self.assertEqual(inbound_msg.object_id, parent.object_id)
        self.assertEqual(inbound_msg.from_email, 'customer@example.com')
        # Customer HTML is sanitized before storage.
        self.assertNotIn('<script>', inbound_msg.body_html)
        self.assertIn('Thanks!', inbound_msg.body_html)
        mock_forward.assert_called_once_with(inbound_msg.id)

    def test_duplicate_delivery_is_deduped(self):
        parent = make_outbound(make_tenant(), status='sent')
        to_addr = f'reply+{parent.reply_token}@reply.platform.test'

        with patch('core.tasks.forward_inbound_email.delay'), \
             self.captureOnCommitCallbacks(execute=True):
            handle_inbound_email(sender=None, event=self._inbound_event(to_addr), esp_name='Resend')
            handle_inbound_email(sender=None, event=self._inbound_event(to_addr), esp_name='Resend')

        self.assertEqual(EmailMessage.objects.filter(direction='inbound').count(), 1)

    def test_missing_token_is_ignored(self):
        make_outbound(make_tenant(), status='sent')
        event = self._inbound_event('someone@reply.platform.test')
        handle_inbound_email(sender=None, event=event, esp_name='Resend')
        self.assertEqual(EmailMessage.objects.filter(direction='inbound').count(), 0)

    def test_own_domain_loop_guard(self):
        parent = make_outbound(make_tenant(), status='sent')
        event = self._inbound_event(
            f'reply+{parent.reply_token}@reply.platform.test',
            from_addr='repairhero@mail.platform.test',
        )
        handle_inbound_email(sender=None, event=event, esp_name='Resend')
        self.assertEqual(EmailMessage.objects.filter(direction='inbound').count(), 0)


@override_settings(**EMAIL_OVERRIDES)
class ForwardInboundTests(TestCase):
    def test_forwards_to_tenant_inbox_with_customer_reply_to(self):
        from core.tasks import forward_inbound_email

        tenant = make_tenant()
        TenantEmailSettings.objects.create(tenant=tenant, reply_forward_email='andrzej@repairhero.com')
        parent = make_outbound(tenant, status='sent')
        inbound_msg = make_outbound(
            tenant, direction='inbound', status='received', reply_token='',
            from_email='customer@example.com', to_email=build_reply_to(parent.reply_token),
            in_reply_to=parent, subject='Re: Your repair', body_text='Thanks!',
        )

        forward_inbound_email.apply(args=[inbound_msg.id])

        self.assertEqual(len(mail.outbox), 1)
        forwarded = mail.outbox[0]
        self.assertEqual(forwarded.to, ['andrzej@repairhero.com'])
        self.assertEqual(forwarded.reply_to, ['customer@example.com'])
        self.assertIn('Thanks!', forwarded.body)

    def test_skips_when_no_forward_address(self):
        from core.tasks import forward_inbound_email

        tenant = make_tenant()
        inbound_msg = make_outbound(tenant, direction='inbound', status='received', reply_token='')
        forward_inbound_email.apply(args=[inbound_msg.id])
        self.assertEqual(len(mail.outbox), 0)
