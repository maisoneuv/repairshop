from django.contrib import admin
from django.contrib import messages

from core.admin_mixins import TenantAwareImportExportAdmin
from core.models import PicklistValue

from .models import (
    Task, TaskType, TaskTypeValidationRule, WorkItem,
    ProcessTemplate, StageDefinition, StageOutcome, CheckpointField,
    WorkItemPause, StageTransition, Notification,
)


class TaskTypeValidationRuleInline(admin.TabularInline):
    """Inline admin for TaskTypeValidationRule within TaskType admin"""
    model = TaskTypeValidationRule
    extra = 1
    fields = ['field_name', 'is_required']


@admin.register(TaskType)
class TaskTypeAdmin(TenantAwareImportExportAdmin):
    """Admin interface for TaskType model"""
    list_display = ['name', 'tenant', 'estimated_duration', 'is_active', 'created_date']
    list_filter = ['tenant', 'is_active', 'created_date']
    search_fields = ['name']
    readonly_fields = ['created_date']
    inlines = [TaskTypeValidationRuleInline]

    fieldsets = (
        (None, {
            'fields': ('tenant', 'name', 'is_active')
        }),
        ('Duration', {
            'fields': ('estimated_duration',)
        }),
        ('Metadata', {
            'fields': ('created_date',),
            'classes': ('collapse',)
        }),
    )


@admin.register(TaskTypeValidationRule)
class TaskTypeValidationRuleAdmin(TenantAwareImportExportAdmin):
    """Admin interface for TaskTypeValidationRule model"""
    list_display = ['task_type', 'field_name', 'is_required']
    list_filter = ['task_type', 'is_required']
    search_fields = ['task_type__name', 'field_name']


@admin.register(Task)
class TaskAdmin(TenantAwareImportExportAdmin):
    """Admin interface for Task model"""
    list_display = ['summary', 'task_type', 'status', 'assigned_employee', 'work_item', 'created_date']
    list_filter = ['status', 'task_type', 'created_date']
    search_fields = ['summary', 'description']
    readonly_fields = ['created_date', 'completed_date', 'actual_duration']

    fieldsets = (
        (None, {
            'fields': ('tenant', 'summary', 'description', 'task_type', 'status')
        }),
        ('Assignment', {
            'fields': ('work_item', 'assigned_employee', 'due_date')
        }),
        ('Timing', {
            'fields': ('created_date', 'completed_date', 'actual_duration'),
            'classes': ('collapse',)
        }),
    )


@admin.register(WorkItem)
class WorkItemAdmin(TenantAwareImportExportAdmin):
    """Admin interface for WorkItem model"""
    list_display = ['reference_id', 'customer', 'status', 'type', 'created_date']
    list_filter = ['status', 'type', 'priority', 'created_date']
    search_fields = ['reference_id', 'description', 'customer__first_name', 'customer__last_name']
    readonly_fields = ['reference_id', 'created_date']


@admin.register(PicklistValue)
class PicklistValueAdmin(TenantAwareImportExportAdmin):
    """Admin interface for managing picklist values"""

    list_display = ['category', 'name', 'value', 'color', 'status_role', 'tenant',
                    'sort_order', 'is_active', 'is_system', 'usage_count']
    list_filter = ['tenant', 'category', 'is_active', 'is_system', 'status_role']
    search_fields = ['name', 'value', 'category']
    ordering = ['tenant', 'category', 'sort_order', 'name']

    fieldsets = (
        (None, {
            'fields': ('tenant', 'category', 'name', 'value')
        }),
        ('Display & Ordering', {
            'fields': ('color', 'sort_order', 'is_active')
        }),
        ('Workflow', {
            'fields': ('status_role', 'allowed_transitions'),
            'description': 'status_role decouples frontend behaviour from hardcoded status names. '
                           'allowed_transitions restricts which statuses this value can move to (empty = unrestricted).',
        }),
        ('System', {
            'fields': ('is_system', 'created_date'),
            'classes': ('collapse',)
        }),
    )

    readonly_fields = ['created_date']

    actions = ['activate_values', 'deactivate_values']

    def usage_count(self, obj):
        """Display how many records use this picklist value"""
        count = 0

        if obj.category == 'workitem_status':
            count = WorkItem.objects.filter(status=obj.value, tenant=obj.tenant).count()
        elif obj.category == 'task_status':
            count = Task.objects.filter(status=obj.value, tenant=obj.tenant).count()
        elif obj.category == 'currency':
            count = WorkItem.objects.filter(currency=obj.value, tenant=obj.tenant).count()

        return count
    usage_count.short_description = 'In Use'

    @admin.action(description="Activate selected values")
    def activate_values(self, request, queryset):
        """Bulk activate selected picklist values"""
        updated = queryset.update(is_active=True)
        self.message_user(request, f"{updated} value(s) activated.", messages.SUCCESS)

    @admin.action(description="Deactivate selected values")
    def deactivate_values(self, request, queryset):
        """Bulk deactivate selected picklist values (only if not in use)"""
        # Check if any values are in use
        in_use = []
        for obj in queryset:
            if self.usage_count(obj) > 0:
                in_use.append(f"{obj.category}:{obj.value}")

        if in_use:
            self.message_user(
                request,
                f"Cannot deactivate values in use: {', '.join(in_use)}",
                messages.ERROR
            )
            return

        updated = queryset.update(is_active=False)
        self.message_user(request, f"{updated} value(s) deactivated.", messages.SUCCESS)

    def delete_model(self, request, obj):
        """Prevent deletion of values in use"""
        usage = self.usage_count(obj)
        if usage > 0:
            messages.error(
                request,
                f"Cannot delete '{obj.name}' - it is currently in use by {usage} record(s). "
                f"Deactivate it instead."
            )
            return

        if obj.is_system:
            messages.warning(
                request,
                f"Deleting system value '{obj.name}'. This may affect application functionality."
            )

        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        """Prevent bulk deletion of values in use"""
        in_use = []
        for obj in queryset:
            if self.usage_count(obj) > 0:
                in_use.append(obj)

        if in_use:
            messages.error(
                request,
                f"Cannot delete {len(in_use)} value(s) that are currently in use. "
                f"Deactivate them instead."
            )
            # Delete only the ones not in use
            queryset = queryset.exclude(id__in=[obj.id for obj in in_use])

        if queryset.exists():
            super().delete_queryset(request, queryset)


# ---------------------------------------------------------------------------
# Guided work-item process (behind the `workitem.guided_process` flag)
# ---------------------------------------------------------------------------

class StageDefinitionInline(admin.TabularInline):
    model = StageDefinition
    extra = 0
    ordering = ['order']
    fields = ['order', 'key', 'name', 'owner_role', 'status_value']


@admin.register(ProcessTemplate)
class ProcessTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'is_default', 'created_at']
    list_filter = ['tenant', 'is_default']
    search_fields = ['name']
    inlines = [StageDefinitionInline]


class StageOutcomeInline(admin.TabularInline):
    model = StageOutcome
    fk_name = 'stage'
    extra = 0
    ordering = ['order']
    fields = ['order', 'kind', 'label', 'target_stage', 'waiting_on',
              'reassign_to_owner', 'resume_returns_to', 'resolve_label']


class CheckpointFieldInline(admin.TabularInline):
    model = CheckpointField
    extra = 0
    ordering = ['order']
    fields = ['order', 'custom_field', 'standard_key', 'required']


@admin.register(StageDefinition)
class StageDefinitionAdmin(admin.ModelAdmin):
    list_display = ['name', 'process', 'owner_role', 'order', 'status_value']
    list_filter = ['process__tenant', 'owner_role']
    search_fields = ['name', 'key']
    inlines = [StageOutcomeInline, CheckpointFieldInline]
    fields = ['process', 'order', 'key', 'name', 'owner_role', 'status_value',
              'guidance', 'recap_sources']


@admin.register(WorkItemPause)
class WorkItemPauseAdmin(admin.ModelAdmin):
    list_display = ['work_item', 'waiting_on', 'held_by', 'reassigned', 'since']
    list_filter = ['waiting_on', 'held_by']
    search_fields = ['work_item__reference_id']


@admin.register(StageTransition)
class StageTransitionAdmin(admin.ModelAdmin):
    """Append-only audit — read-only in admin."""
    list_display = ['work_item', 'kind', 'from_stage', 'to_stage', 'by_user', 'at']
    list_filter = ['kind']
    search_fields = ['work_item__reference_id']
    date_hierarchy = 'at'
    readonly_fields = ['work_item', 'kind', 'from_stage', 'to_stage', 'by_user',
                       'at', 'note', 'captured_values', 'assigned_at', 'started_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['type', 'recipient', 'work_item', 'read', 'created_at']
    list_filter = ['type', 'read', 'tenant']
    search_fields = ['work_item__reference_id']
