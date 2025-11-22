"""
Integration models for tracking external system syncs (n8n, Notion, Slack, etc.)
"""
from django.db import models
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from tenants.models import Tenant


class TenantIntegration(models.Model):
    """
    Stores per-tenant integration configurations (e.g., n8n webhook URLs).
    Each tenant can have their own integrations configured.
    """

    INTEGRATION_TYPES = [
        ('n8n', 'n8n Webhook'),
        ('notion', 'Notion'),
        ('slack', 'Slack'),
    ]

    EVENT_TYPES = [
        ('workitem_created', 'WorkItem Created'),
        ('workitem_updated', 'WorkItem Updated'),
        ('workitem_status_changed', 'WorkItem Status Changed'),
        ('task_created', 'Task Created'),
        ('task_updated', 'Task Updated'),
    ]

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='integrations'
    )
    name = models.CharField(
        max_length=100,
        help_text="Friendly name for this integration (e.g., 'Production n8n Workflow')"
    )
    integration_type = models.CharField(
        max_length=20,
        choices=INTEGRATION_TYPES,
        help_text="Type of integration (n8n, Notion, Slack, etc.)"
    )
    event_type = models.CharField(
        max_length=50,
        choices=EVENT_TYPES,
        help_text="Which event triggers this integration"
    )
    webhook_url = models.URLField(
        max_length=500,
        help_text="The webhook URL to POST data to (for n8n, Slack, etc.)"
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Enable/disable this integration without deleting it"
    )
    headers = models.JSONField(
        default=dict,
        blank=True,
        help_text="Optional HTTP headers to include (e.g., authentication tokens)"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['tenant', 'name']
        indexes = [
            models.Index(fields=['tenant', 'event_type', 'is_active']),
        ]

    def __str__(self):
        return f"{self.tenant.name} - {self.name} ({self.get_integration_type_display()})"


class IntegrationSync(models.Model):
    """
    Tracks the sync status of individual objects to external systems.
    Provides idempotency, audit trail, and retry management.
    """

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('synced', 'Synced'),
        ('failed', 'Failed'),
    ]

    integration = models.ForeignKey(
        TenantIntegration,
        on_delete=models.CASCADE,
        related_name='syncs'
    )

    # Generic relation to track any model (WorkItem, Task, etc.)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')

    # Sync metadata
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    event_type = models.CharField(
        max_length=50,
        help_text="The event that triggered this sync (created, updated, etc.)"
    )
    retry_count = models.IntegerField(
        default=0,
        help_text="Number of times this sync has been retried"
    )
    last_error = models.TextField(
        blank=True,
        null=True,
        help_text="Error message from the last failed attempt"
    )

    # External system reference (if applicable)
    external_id = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="ID of the object in the external system (e.g., Notion page ID)"
    )

    # Request/response tracking
    request_payload = models.JSONField(
        blank=True,
        null=True,
        help_text="The payload sent to the external system"
    )
    response_data = models.JSONField(
        blank=True,
        null=True,
        help_text="Response data from the external system"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    last_attempt_at = models.DateTimeField(auto_now=True)
    synced_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="When the sync successfully completed"
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['status', 'retry_count']),
            models.Index(fields=['integration', 'status']),
            models.Index(fields=['integration', 'content_type', 'object_id', 'event_type']),
        ]
        # Note: No unique_together constraint - we want multiple sync records for update events
        # This allows tracking history of all syncs (creation + all updates)

    def __str__(self):
        return f"{self.integration.name} - {self.content_type} #{self.object_id} ({self.status})"

    def can_retry(self, max_retries=3):
        """Check if this sync can be retried."""
        return self.status == 'failed' and self.retry_count < max_retries
