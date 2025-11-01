from django.contrib import admin
from .models import WorkItem, Task, TaskType, TaskTypeValidationRule


class TaskTypeValidationRuleInline(admin.TabularInline):
    """Inline admin for TaskTypeValidationRule within TaskType admin"""
    model = TaskTypeValidationRule
    extra = 1
    fields = ['field_name', 'is_required']


@admin.register(TaskType)
class TaskTypeAdmin(admin.ModelAdmin):
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
class TaskTypeValidationRuleAdmin(admin.ModelAdmin):
    """Admin interface for TaskTypeValidationRule model"""
    list_display = ['task_type', 'field_name', 'is_required']
    list_filter = ['task_type', 'is_required']
    search_fields = ['task_type__name', 'field_name']


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
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
class WorkItemAdmin(admin.ModelAdmin):
    """Admin interface for WorkItem model"""
    list_display = ['reference_id', 'customer', 'status', 'type', 'created_date']
    list_filter = ['status', 'type', 'priority', 'created_date']
    search_fields = ['reference_id', 'description', 'customer__first_name', 'customer__last_name']
    readonly_fields = ['reference_id', 'created_date']
