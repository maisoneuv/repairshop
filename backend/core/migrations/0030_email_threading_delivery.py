import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


def backfill_email_fields(apps, schema_editor):
    """Backfill created_at from legacy sent_at and map legacy statuses."""
    EmailMessage = apps.get_model('core', 'EmailMessage')
    for email in EmailMessage.objects.all().iterator():
        EmailMessage.objects.filter(pk=email.pk).update(
            created_at=email.sent_at,
            status='queued' if email.status == 'pending' else email.status,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0029_rename_sentemail_emailmessage'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailmessage',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='emailmessage',
            name='direction',
            field=models.CharField(choices=[('outbound', 'Outbound'), ('inbound', 'Inbound')], db_index=True, default='outbound', max_length=10),
        ),
        migrations.AddField(
            model_name='emailmessage',
            name='from_email',
            field=models.CharField(blank=True, max_length=320),
        ),
        migrations.AddField(
            model_name='emailmessage',
            name='delivered_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='emailmessage',
            name='provider_message_id',
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
        migrations.AddField(
            model_name='emailmessage',
            name='message_id_header',
            field=models.CharField(blank=True, max_length=998),
        ),
        migrations.AddField(
            model_name='emailmessage',
            name='in_reply_to',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='replies', to='core.emailmessage'),
        ),
        migrations.AddField(
            model_name='emailmessage',
            name='reply_token',
            field=models.CharField(blank=True, db_index=True, max_length=32),
        ),
        # State-only fix: 0028 recorded related_name='sent_emails'; the model was renamed
        # and now uses 'email_messages'.
        migrations.AlterField(
            model_name='emailmessage',
            name='tenant',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='email_messages', to='tenants.tenant'),
        ),
        migrations.AlterField(
            model_name='emailmessage',
            name='status',
            field=models.CharField(choices=[('queued', 'Queued'), ('sending', 'Sending'), ('sent', 'Sent'), ('delivered', 'Delivered'), ('bounced', 'Bounced'), ('complained', 'Complained'), ('failed', 'Failed'), ('received', 'Received')], default='queued', max_length=20),
        ),
        migrations.AlterField(
            model_name='emailmessage',
            name='sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterModelOptions(
            name='emailmessage',
            options={'ordering': ['-created_at']},
        ),
        migrations.AddConstraint(
            model_name='emailmessage',
            constraint=models.UniqueConstraint(condition=models.Q(('reply_token', ''), _negated=True), fields=('reply_token',), name='unique_nonempty_reply_token'),
        ),
        migrations.RunPython(backfill_email_fields, migrations.RunPython.noop),
    ]
