from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DefaultUserAdmin
from django.contrib.auth.models import Permission
from django.utils.translation import gettext_lazy as _

from core.admin_mixins import TenantAwareImportExportAdmin, TenantAwareImportExportMixin
from core.models import Address, Note, Role, RolePermission, User, UserRole

class UserRoleInline(admin.TabularInline):
    model = UserRole
    extra = 1
    autocomplete_fields = ['role']


@admin.register(User)
class UserAdmin(TenantAwareImportExportMixin, DefaultUserAdmin):
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

class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 1
    autocomplete_fields = ['permission']


@admin.register(Role)
class RoleAdmin(TenantAwareImportExportAdmin):
    list_display = ('name', 'tenant')
    list_filter = ('tenant',)
    search_fields = ('name',)
    inlines = [RolePermissionInline]


@admin.register(RolePermission)
class RolePermissionAdmin(TenantAwareImportExportAdmin):
    list_display = ('role', 'permission')
    search_fields = ('role__name', 'permission__codename')
    autocomplete_fields = ['role', 'permission']


@admin.register(UserRole)
class UserRoleAdmin(TenantAwareImportExportAdmin):
    list_display = ('user', 'role', 'tenant')
    search_fields = ('user__email', 'role__name', 'role__tenant__name')
    autocomplete_fields = ['user', 'role']

    def tenant(self, obj):
        return obj.role.tenant


@admin.register(Permission)
class CustomPermissionAdmin(TenantAwareImportExportAdmin):
    search_fields = ['codename', 'name']


@admin.register(Address)
class AddressAdmin(TenantAwareImportExportAdmin):
    list_display = ('street', 'building_number', 'city', 'postal_code', 'country')
    search_fields = ('street', 'city', 'postal_code', 'country')


@admin.register(Note)
class NoteAdmin(TenantAwareImportExportAdmin):
    list_display = ('content', 'author', 'created_at')
    search_fields = ('content', 'author__email')
