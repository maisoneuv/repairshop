"""
Django admin configuration for Integration models.
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import TenantIntegration, IntegrationSync, IntegrationRequestLog


@admin.register(TenantIntegration)
class TenantIntegrationAdmin(admin.ModelAdmin):
    """Admin interface for managing tenant integrations."""

    list_display = [
        'name',
        'tenant',
        'integration_type',
        'event_type',
        'is_active_badge',
        'created_at',
    ]
    list_filter = [
        'integration_type',
        'event_type',
        'is_active',
        'tenant',
    ]
    search_fields = [
        'name',
        'webhook_url',
        'tenant__name',
    ]
    readonly_fields = [
        'created_at',
        'updated_at',
    ]

    fieldsets = (
        ('Basic Information', {
            'fields': ('tenant', 'name', 'integration_type', 'event_type', 'is_active')
        }),
        ('Webhook Configuration', {
            'fields': ('webhook_url', 'headers'),
            'description': 'Configure the webhook URL and optional HTTP headers (e.g., authentication tokens)'
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def is_active_badge(self, obj):
        """Display a colored badge for active/inactive status."""
        if obj.is_active:
            return format_html(
                '<span style="color: green; font-weight: bold;">● Active</span>'
            )
        return format_html(
            '<span style="color: red; font-weight: bold;">● Inactive</span>'
        )
    is_active_badge.short_description = 'Status'


@admin.register(IntegrationSync)
class IntegrationSyncAdmin(admin.ModelAdmin):
    """Admin interface for viewing integration sync history."""

    list_display = [
        'id',
        'integration',
        'content_type',
        'object_id',
        'event_type',
        'status_badge',
        'retry_count',
        'last_attempt_at',
    ]
    list_filter = [
        'status',
        'event_type',
        'integration__integration_type',
        'content_type',
        'created_at',
    ]
    search_fields = [
        'integration__name',
        'object_id',
        'external_id',
        'last_error',
    ]
    readonly_fields = [
        'integration',
        'content_type',
        'object_id',
        'event_type',
        'request_payload',
        'response_data',
        'created_at',
        'last_attempt_at',
        'synced_at',
        'last_error',
        'external_id',
    ]

    fieldsets = (
        ('Sync Information', {
            'fields': ('integration', 'content_type', 'object_id', 'event_type')
        }),
        ('Status', {
            'fields': ('status', 'retry_count', 'external_id')
        }),
        ('Request/Response Data', {
            'fields': ('request_payload', 'response_data'),
            'classes': ('collapse',)
        }),
        ('Error Information', {
            'fields': ('last_error',),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'last_attempt_at', 'synced_at'),
            'classes': ('collapse',)
        }),
    )

    def status_badge(self, obj):
        """Display a colored badge for sync status."""
        colors = {
            'pending': 'orange',
            'synced': 'green',
            'failed': 'red',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="color: {}; font-weight: bold;">● {}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = 'Status'

    def has_add_permission(self, request):
        """Disable manual creation of sync records."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Allow deletion for cleanup purposes."""
        return True


@admin.register(IntegrationRequestLog)
class IntegrationRequestLogAdmin(admin.ModelAdmin):
    """Admin interface for viewing integration request logs."""

    list_display = [
        'id',
        'timestamp',
        'tenant',
        'direction_badge',
        'method',
        'url_truncated',
        'status_badge',
        'response_time_display',
        'source_display',
    ]
    list_filter = [
        'direction',
        'success',
        'method',
        'tenant',
        ('timestamp', admin.DateFieldListFilter),
        'response_status_code',
    ]
    search_fields = [
        'url',
        'error_message',
        'integration__name',
        'api_key__name',
    ]
    readonly_fields = [
        'tenant',
        'direction',
        'timestamp',
        'response_time_ms',
        'method',
        'url',
        'request_headers',
        'request_body',
        'request_body_truncated',
        'response_status_code',
        'response_headers',
        'response_body',
        'response_body_truncated',
        'success',
        'error_message',
        'integration',
        'integration_sync',
        'api_key',
        'retry_number',
        'client_ip',
        'user_agent',
    ]
    date_hierarchy = 'timestamp'

    fieldsets = (
        ('Request Overview', {
            'fields': ('tenant', 'direction', 'method', 'url', 'timestamp', 'response_time_ms')
        }),
        ('Status', {
            'fields': ('success', 'response_status_code', 'error_message')
        }),
        ('Request Details', {
            'fields': ('request_headers', 'request_body', 'request_body_truncated'),
            'classes': ('collapse',)
        }),
        ('Response Details', {
            'fields': ('response_headers', 'response_body', 'response_body_truncated'),
            'classes': ('collapse',)
        }),
        ('Context', {
            'fields': ('integration', 'integration_sync', 'api_key', 'retry_number'),
            'classes': ('collapse',)
        }),
        ('Client Info (Inbound)', {
            'fields': ('client_ip', 'user_agent'),
            'classes': ('collapse',)
        }),
    )

    def direction_badge(self, obj):
        """Display a colored badge for direction."""
        colors = {'inbound': 'blue', 'outbound': 'purple'}
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            colors.get(obj.direction, 'gray'),
            obj.get_direction_display()
        )
    direction_badge.short_description = 'Direction'

    def url_truncated(self, obj):
        """Display truncated URL for list view."""
        url = obj.url
        if len(url) > 50:
            return url[:50] + '...'
        return url
    url_truncated.short_description = 'URL'

    def status_badge(self, obj):
        """Display a colored badge for success/failure."""
        if obj.success:
            return format_html(
                '<span style="color: green; font-weight: bold;">✓ {}</span>',
                obj.response_status_code or 'OK'
            )
        return format_html(
            '<span style="color: red; font-weight: bold;">✗ {}</span>',
            obj.response_status_code or 'Error'
        )
    status_badge.short_description = 'Status'

    def response_time_display(self, obj):
        """Display response time in human-readable format."""
        if obj.response_time_ms is None:
            return '-'
        if obj.response_time_ms > 1000:
            return f'{obj.response_time_ms / 1000:.2f}s'
        return f'{obj.response_time_ms}ms'
    response_time_display.short_description = 'Response Time'

    def source_display(self, obj):
        """Display the source (integration or API key)."""
        if obj.integration:
            return f'Integration: {obj.integration.name}'
        if obj.api_key:
            return f'API Key: {obj.api_key.name}'
        return '-'
    source_display.short_description = 'Source'

    def has_add_permission(self, request):
        """Disable manual creation of log records."""
        return False

    def has_change_permission(self, request, obj=None):
        """Disable editing of log records."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Allow deletion for cleanup purposes."""
        return True
