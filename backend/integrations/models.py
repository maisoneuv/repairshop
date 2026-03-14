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
        ('workitem_summary_requested', 'WorkItem Summary Requested'),
        ('task_created', 'Task Created'),
        ('task_updated', 'Task Updated'),
        ('task_status_changed', 'Task Status Changed'),
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


class IntegrationRequestLog(models.Model):
    """
    Unified logging for all integration HTTP requests (inbound and outbound).
    Provides detailed audit trail with request/response data, timing, and status.
    """

    DIRECTION_CHOICES = [
        ('inbound', 'Inbound (External to Us)'),
        ('outbound', 'Outbound (Us to External)'),
    ]

    # Core identification
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='integration_logs'
    )
    direction = models.CharField(
        max_length=10,
        choices=DIRECTION_CHOICES,
        db_index=True
    )

    # Timing
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    response_time_ms = models.IntegerField(
        null=True,
        blank=True,
        help_text="Response time in milliseconds"
    )

    # HTTP details
    method = models.CharField(max_length=10)  # GET, POST, PUT, DELETE, etc.
    url = models.TextField(help_text="Full URL for outbound, endpoint path for inbound")

    # Request data
    request_headers = models.JSONField(
        default=dict,
        blank=True,
        help_text="HTTP headers (sensitive headers redacted)"
    )
    request_body = models.JSONField(
        null=True,
        blank=True,
        help_text="Request body (may be truncated)"
    )
    request_body_truncated = models.BooleanField(
        default=False,
        help_text="True if request body was truncated due to size"
    )

    # Response data
    response_status_code = models.IntegerField(
        null=True,
        blank=True,
        help_text="HTTP status code"
    )
    response_headers = models.JSONField(
        default=dict,
        blank=True,
        help_text="Response headers"
    )
    response_body = models.JSONField(
        null=True,
        blank=True,
        help_text="Response body (may be truncated)"
    )
    response_body_truncated = models.BooleanField(
        default=False,
        help_text="True if response body was truncated due to size"
    )

    # Status tracking
    success = models.BooleanField(
        db_index=True,
        help_text="True if request was successful (2xx for outbound, completed for inbound)"
    )
    error_message = models.TextField(
        blank=True,
        null=True,
        help_text="Error message if request failed"
    )

    # Relationships (optional, based on context)
    # For outbound: link to the integration config and sync record
    integration = models.ForeignKey(
        'integrations.TenantIntegration',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='request_logs',
        help_text="For outbound: which integration triggered this"
    )
    integration_sync = models.ForeignKey(
        'integrations.IntegrationSync',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='request_logs',
        help_text="For outbound: which sync record this log belongs to"
    )

    # For inbound: link to the API key used
    api_key = models.ForeignKey(
        'core.APIKey',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='request_logs',
        help_text="For inbound: which API key was used"
    )

    # Retry tracking (for outbound)
    retry_number = models.IntegerField(
        default=0,
        help_text="For outbound: which retry attempt this is (0 = first attempt)"
    )

    # Client info (for inbound)
    client_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="For inbound: client IP address"
    )
    user_agent = models.TextField(
        blank=True,
        null=True,
        help_text="For inbound: User-Agent header"
    )

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant', 'timestamp']),
            models.Index(fields=['tenant', 'direction', 'success']),
            models.Index(fields=['integration', 'timestamp']),
            models.Index(fields=['api_key', 'timestamp']),
            models.Index(fields=['integration_sync']),
        ]
        verbose_name = "Integration Request Log"
        verbose_name_plural = "Integration Request Logs"

    def __str__(self):
        status = self.response_status_code or 'N/A'
        return f"{self.direction} {self.method} {status} - {self.timestamp}"


class CustomAction(models.Model):
    """
    Admin-configurable action buttons shown on WorkItem and Task detail pages.
    When clicked, sends an HTTP POST to the configured webhook URL with full record data.
    """

    TARGET_CHOICES = [
        ('workitem', 'Work Item'),
        ('task', 'Task'),
        ('global', 'Global (Side Menu)'),
    ]

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='custom_actions'
    )
    name = models.CharField(
        max_length=100,
        help_text="Button label shown to users"
    )
    target = models.CharField(
        max_length=20,
        choices=TARGET_CHOICES,
        help_text="Which detail page to show this button on"
    )
    webhook_url = models.URLField(
        max_length=500,
        help_text="URL to POST to when the button is clicked"
    )
    headers = models.JSONField(
        default=dict,
        blank=True,
        help_text="Optional HTTP headers (e.g. {\"Authorization\": \"Bearer token\"})"
    )
    show_text_input = models.BooleanField(
        default=False,
        help_text="Show a text field above the button for users to enter additional context"
    )
    text_input_label = models.CharField(
        max_length=100,
        blank=True,
        default='Additional notes',
        help_text="Label/placeholder for the text input field"
    )
    include_record_details = models.BooleanField(
        default=True,
        help_text="Include full record data in the request body. If disabled, only record ID and user input are sent."
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Enable/disable without deleting"
    )
    required_role = models.ForeignKey(
        'core.Role',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='custom_actions',
        help_text="If set, only users with this role can see and use this action"
    )
    sort_order = models.IntegerField(
        default=0,
        help_text="Display order (lower numbers appear first)"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']
        indexes = [
            models.Index(fields=['tenant', 'target', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_target_display()}) — {self.tenant.name}"
