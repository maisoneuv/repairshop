"""
Django admin configuration for form templates and documents.
"""
from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.safestring import mark_safe
from django import forms

from .models import FormTemplate, FormDocument
from .widgets import MergeFieldCKEditorWidget


class FormTemplateAdminForm(forms.ModelForm):
    """Custom form for FormTemplate admin with Merge Field Selector"""

    class Meta:
        model = FormTemplate
        fields = '__all__'
        widgets = {
            'html_content': MergeFieldCKEditorWidget(config_name='default'),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        # Add help text for the HTML content field
        self.fields['html_content'].help_text = mark_safe(
            '<p style="margin: 10px 0; font-size: 13px; color: #666;">'
            'Use the <strong>Merge Fields</strong> panel above to insert template variables. '
            'Click <strong>Source</strong> in the editor toolbar to view/edit raw HTML. '
            'Dates are formatted as DD.MM.YYYY (Polish format). Prices include 2 decimal places.'
            '</p>'
        )


@admin.register(FormTemplate)
class FormTemplateAdmin(admin.ModelAdmin):
    """Admin interface for FormTemplate with CKEditor and preview functionality"""

    form = FormTemplateAdminForm

    list_display = [
        'name',
        'form_type',
        'tenant',
        'is_active_badge',
        'created_at',
        'updated_at',
    ]

    list_filter = [
        'form_type',
        'is_active',
        'created_at',
        'tenant',
    ]

    search_fields = [
        'name',
        'tenant__name',
    ]

    readonly_fields = [
        'created_at',
        'updated_at',
        'created_by',
    ]

    fieldsets = (
        ('Basic Information', {
            'fields': ('tenant', 'form_type', 'name', 'is_active')
        }),
        ('Template Content', {
            'fields': ('html_content',),
            'description': 'Use {{variable}} syntax to insert dynamic data. See available variables below.'
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at', 'created_by'),
            'classes': ('collapse',)
        }),
    )

    actions = ['activate_template', 'deactivate_template', 'duplicate_template']

    def is_active_badge(self, obj):
        """Display active status as colored badge"""
        if obj.is_active:
            return format_html(
                '<span style="background: #28a745; color: white; padding: 3px 8px; border-radius: 3px; font-weight: bold;">ACTIVE</span>'
            )
        return format_html(
            '<span style="background: #6c757d; color: white; padding: 3px 8px; border-radius: 3px;">Inactive</span>'
        )
    is_active_badge.short_description = 'Status'

    def save_model(self, request, obj, form, change):
        """Set created_by on new templates"""
        if not change:  # New object
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    def activate_template(self, request, queryset):
        """Admin action to activate selected templates"""
        count = 0
        for template in queryset:
            template.is_active = True
            template.save()  # save() method handles deactivating others
            count += 1

        self.message_user(
            request,
            f"Activated {count} template(s). Other templates of the same type were deactivated."
        )
    activate_template.short_description = "Activate selected templates"

    def deactivate_template(self, request, queryset):
        """Admin action to deactivate selected templates"""
        count = queryset.update(is_active=False)
        self.message_user(request, f"Deactivated {count} template(s).")
    deactivate_template.short_description = "Deactivate selected templates"

    def duplicate_template(self, request, queryset):
        """Admin action to duplicate templates"""
        count = 0
        for template in queryset:
            template.pk = None  # Create new instance
            template.name = f"{template.name} (Copy)"
            template.is_active = False
            template.created_by = request.user
            template.save()
            count += 1

        self.message_user(request, f"Duplicated {count} template(s).")
    duplicate_template.short_description = "Duplicate selected templates"


@admin.register(FormDocument)
class FormDocumentAdmin(admin.ModelAdmin):
    """Admin interface for FormDocument (read-only, for viewing generated PDFs)"""

    list_display = [
        'work_item_link',
        'form_type',
        'status_badge',
        'generated_at',
        'generated_by_display',
        'template_name',
        'download_link',
    ]

    list_filter = [
        'form_type',
        'status',
        'generated_at',
        'tenant',
    ]

    search_fields = [
        'work_item__reference_id',
        'work_item__customer__first_name',
        'work_item__customer__last_name',
        'template__name',
    ]

    readonly_fields = [
        'tenant',
        'form_type',
        'template',
        'work_item',
        'file_path',
        'generated_at',
        'generated_by',
        'status',
        'error_message',
        'preview_link',
    ]

    fieldsets = (
        ('Document Information', {
            'fields': ('work_item', 'form_type', 'template', 'status')
        }),
        ('File Information', {
            'fields': ('file_path', 'preview_link')
        }),
        ('Generation Details', {
            'fields': ('generated_at', 'generated_by', 'error_message')
        }),
    )

    def has_add_permission(self, request):
        """Prevent manual creation of documents (they're auto-generated)"""
        return False

    def has_delete_permission(self, request, obj=None):
        """Allow deletion of documents"""
        return True

    def work_item_link(self, obj):
        """Link to work item admin page"""
        if obj.work_item:
            url = reverse('admin:tasks_workitem_change', args=[obj.work_item.id])
            return format_html('<a href="{}">{}</a>', url, obj.work_item.reference_id)
        return '-'
    work_item_link.short_description = 'Work Item'

    def status_badge(self, obj):
        """Display status as colored badge"""
        colors = {
            FormDocument.STATUS_SUCCESS: '#28a745',
            FormDocument.STATUS_ERROR: '#dc3545',
            FormDocument.STATUS_PENDING: '#ffc107',
        }
        color = colors.get(obj.status, '#6c757d')

        icons = {
            FormDocument.STATUS_SUCCESS: '✓',
            FormDocument.STATUS_ERROR: '✗',
            FormDocument.STATUS_PENDING: '⏳',
        }
        icon = icons.get(obj.status, '')

        return format_html(
            '<span style="background: {}; color: white; padding: 3px 8px; border-radius: 3px; font-weight: bold;">{} {}</span>',
            color, icon, obj.get_status_display()
        )
    status_badge.short_description = 'Status'

    def generated_by_display(self, obj):
        """Display who generated the document"""
        if obj.generated_by:
            return obj.generated_by.get_full_name() or obj.generated_by.email
        return 'Auto-generated'
    generated_by_display.short_description = 'Generated By'

    def template_name(self, obj):
        """Display template name"""
        return obj.template.name if obj.template else '-'
    template_name.short_description = 'Template'

    def download_link(self, obj):
        """Provide download link for successful PDFs"""
        if obj.status == FormDocument.STATUS_SUCCESS and obj.file_path:
            from django.conf import settings
            url = f"{settings.MEDIA_URL}{obj.file_path}"
            return format_html('<a href="{}" target="_blank">Download PDF</a>', url)
        return '-'
    download_link.short_description = 'Download'

    def preview_link(self, obj):
        """Provide preview link for successful PDFs"""
        if obj.status == FormDocument.STATUS_SUCCESS and obj.file_path:
            from django.conf import settings
            url = f"{settings.MEDIA_URL}{obj.file_path}"
            return format_html(
                '<a href="{}" target="_blank" style="padding: 5px 10px; background: #007bff; color: white; text-decoration: none; border-radius: 3px;">Open PDF</a>',
                url
            )
        return '-'
    preview_link.short_description = 'Preview'
