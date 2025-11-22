# Generated migration for integrations app

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenants', '0001_initial'),  # Adjust this based on your actual tenants migration
        ('contenttypes', '0002_remove_content_type_name'),
    ]

    operations = [
        migrations.CreateModel(
            name='TenantIntegration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(help_text="Friendly name for this integration (e.g., 'Production n8n Workflow')", max_length=100)),
                ('integration_type', models.CharField(choices=[('n8n', 'n8n Webhook'), ('notion', 'Notion'), ('slack', 'Slack')], help_text='Type of integration (n8n, Notion, Slack, etc.)', max_length=20)),
                ('event_type', models.CharField(choices=[('workitem_created', 'WorkItem Created'), ('workitem_updated', 'WorkItem Updated'), ('workitem_status_changed', 'WorkItem Status Changed'), ('task_created', 'Task Created'), ('task_updated', 'Task Updated')], help_text='Which event triggers this integration', max_length=50)),
                ('webhook_url', models.URLField(help_text='The webhook URL to POST data to (for n8n, Slack, etc.)', max_length=500)),
                ('is_active', models.BooleanField(default=True, help_text='Enable/disable this integration without deleting it')),
                ('headers', models.JSONField(blank=True, default=dict, help_text='Optional HTTP headers to include (e.g., authentication tokens)')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='integrations', to='tenants.tenant')),
            ],
            options={
                'ordering': ['tenant', 'name'],
            },
        ),
        migrations.CreateModel(
            name='IntegrationSync',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('object_id', models.PositiveIntegerField()),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('synced', 'Synced'), ('failed', 'Failed')], default='pending', max_length=20)),
                ('event_type', models.CharField(help_text='The event that triggered this sync (created, updated, etc.)', max_length=50)),
                ('retry_count', models.IntegerField(default=0, help_text='Number of times this sync has been retried')),
                ('last_error', models.TextField(blank=True, help_text='Error message from the last failed attempt', null=True)),
                ('external_id', models.CharField(blank=True, help_text='ID of the object in the external system (e.g., Notion page ID)', max_length=255, null=True)),
                ('request_payload', models.JSONField(blank=True, help_text='The payload sent to the external system', null=True)),
                ('response_data', models.JSONField(blank=True, help_text='Response data from the external system', null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('last_attempt_at', models.DateTimeField(auto_now=True)),
                ('synced_at', models.DateTimeField(blank=True, help_text='When the sync successfully completed', null=True)),
                ('content_type', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='contenttypes.contenttype')),
                ('integration', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='syncs', to='integrations.tenantintegration')),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('integration', 'content_type', 'object_id', 'event_type')},
            },
        ),
        migrations.AddIndex(
            model_name='tenantintegration',
            index=models.Index(fields=['tenant', 'event_type', 'is_active'], name='integration_tenant__idx'),
        ),
        migrations.AddIndex(
            model_name='integrationsync',
            index=models.Index(fields=['content_type', 'object_id'], name='integration_content_idx'),
        ),
        migrations.AddIndex(
            model_name='integrationsync',
            index=models.Index(fields=['status', 'retry_count'], name='integration_status__idx'),
        ),
        migrations.AddIndex(
            model_name='integrationsync',
            index=models.Index(fields=['integration', 'status'], name='integration_integra_idx'),
        ),
    ]
