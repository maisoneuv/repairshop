"""
Django admin configuration for Integration models.
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import TenantIntegration, IntegrationSync


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
