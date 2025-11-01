from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _
from core import models
from core.models import User, RolePermission, Role, UserRole
from customers.models import Customer, Asset
from tasks.models import WorkItem, Task
from inventory.models import (Device, Category, InventoryItem, InventoryList, AttributeDefinition,
                              PartAttributeValue,InventoryBalance, PurchaseOrderItem, PurchaseOrder, Supplier)
from service.models import Employee, Location, RepairShop
from tenants.models import Tenant
from django.contrib.auth.admin import UserAdmin as DefaultUserAdmin
from django.contrib.auth.models import Permission

class UserRoleInline(admin.TabularInline):
    model = UserRole
    extra = 1
    autocomplete_fields = ['role']

@admin.register(User)
class UserAdmin(DefaultUserAdmin):
    inlines = [UserRoleInline]
    readonly_fields = DefaultUserAdmin.readonly_fields + ('display_roles_and_permissions',)
    list_display = DefaultUserAdmin.list_display + ('tenant',)
    fieldsets = DefaultUserAdmin.fieldsets + (
        (_("Tenant"), {"fields": ("tenant",)}),
        ("Tenant Roles & Permissions", {"fields": ("display_roles_and_permissions",)}),
    )
    add_fieldsets = DefaultUserAdmin.add_fieldsets + (
        (_("Tenant"), {"fields": ("tenant",)}),
    )

    def display_roles_and_permissions(self, obj):
        lines = []
        for user_role in obj.user_roles.select_related('role__tenant').prefetch_related('role__role_permissions__permission'):
            role = user_role.role
            tenant = role.tenant
            permissions = role.role_permissions.all()

            lines.append(f"- {tenant.name}")
            lines.append(f"   - Role: {role.name}")

            if permissions:
                lines.append("   - Permissions:")
                for rp in permissions:
                    lines.append(f"       - {rp.permission.codename}")
            else:
                lines.append("   - Permissions: (none)")

        if not lines:
            return "No roles assigned."
        return "\n".join(lines)

    display_roles_and_permissions.short_description = "Roles and Permissions per Tenant"

@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ("manufacturer", "model",)
    # filter_horizontal = ("categories",)

class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 1
    autocomplete_fields = ['permission']

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant')
    list_filter = ('tenant',)
    search_fields = ('name',)
    inlines = [RolePermissionInline]

@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'tenant')
    search_fields = ('user__email', 'role__name', 'role__tenant__name')
    autocomplete_fields = ['user', 'role']

    def tenant(self, obj):
        return obj.role.tenant

@admin.register(Permission)
class CustomPermissionAdmin(admin.ModelAdmin):
    search_fields = ['codename', 'name']

admin.site.register(models.Address)
admin.site.register(Customer)
admin.site.register(Asset)
# WorkItem and Task are registered in tasks/admin.py with custom admin classes
admin.site.register(Employee)
admin.site.register(Location)
admin.site.register(Category)
admin.site.register(InventoryItem)
admin.site.register(InventoryList)
admin.site.register(AttributeDefinition)
admin.site.register(PartAttributeValue)
admin.site.register(InventoryBalance)
admin.site.register(PurchaseOrder)
admin.site.register(PurchaseOrderItem)
admin.site.register(Supplier)
admin.site.register(Tenant)
admin.site.register(RepairShop)
