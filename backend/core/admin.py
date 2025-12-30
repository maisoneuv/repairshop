from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DefaultUserAdmin
from django.contrib.auth.models import Permission
from django.utils.translation import gettext_lazy as _

from core.admin_mixins import TenantAwareImportExportAdmin, TenantAwareImportExportMixin
from core.models import Address, Note, Role, RolePermission, User, UserRole, APIKey
from django.contrib import messages
from django.utils.html import format_html

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


@admin.register(APIKey)
class APIKeyAdmin(TenantAwareImportExportAdmin):
    """
    Django admin interface for managing API keys.

    Features:
    - Generate new API keys with secure random generation
    - Display plaintext key only once during creation
    - View usage statistics and audit trail
    - Revoke keys (set inactive) without deletion
    - Search and filter by tenant, role, status
    """
    list_display = (
        'name',
        'prefix_display',
        'tenant',
        'role',
        'is_active_display',
        'usage_count',
        'last_used_at',
        'expires_at',
        'created_on',
    )
    list_filter = (
        'tenant',
        'role',
        'is_active',
        'created_on',
        'last_used_at',
    )
    search_fields = (
        'name',
        'prefix',
        'tenant__name',
        'role__name',
        'notes',
    )
    readonly_fields = (
        'prefix',
        'key_hash',
        'usage_count',
        'last_used_at',
        'last_used_ip',
        'created_on',
        'modified_on',
        'created_by',
    )
    autocomplete_fields = ['tenant', 'role', 'integration', 'created_by']

    fieldsets = (
        (_('Identity'), {
            'fields': ('name', 'tenant', 'notes')
        }),
        (_('Permissions'), {
            'fields': ('role',),
            'description': 'Role determines what permissions this API key has'
        }),
        (_('Integration (Optional)'), {
            'fields': ('integration',),
            'description': 'Link to an outbound integration if this key is for bidirectional flow'
        }),
        (_('Status'), {
            'fields': ('is_active', 'expires_at')
        }),
        (_('Security (Read-only)'), {
            'fields': ('prefix', 'key_hash'),
            'classes': ('collapse',),
            'description': 'The actual API key is hashed and cannot be retrieved'
        }),
        (_('Usage Audit (Read-only)'), {
            'fields': ('usage_count', 'last_used_at', 'last_used_ip'),
            'classes': ('collapse',),
        }),
        (_('Metadata (Read-only)'), {
            'fields': ('created_by', 'created_on', 'modified_on'),
            'classes': ('collapse',),
        }),
    )

    actions = ['generate_new_api_key', 'revoke_api_keys', 'activate_api_keys']

    def prefix_display(self, obj):
        """Display prefix with monospace font for readability"""
        return format_html('<code>{}</code>...', obj.prefix)
    prefix_display.short_description = 'Key Prefix'

    def is_active_display(self, obj):
        """Display active status with color coding"""
        if obj.is_active:
            return format_html('<span style="color: green;">✓ Active</span>')
        else:
            return format_html('<span style="color: red;">✗ Inactive</span>')
    is_active_display.short_description = 'Status'

    def save_model(self, request, obj, form, change):
        """
        Override save to:
        1. Generate API key if new object
        2. Set created_by to current user
        """
        if not change:  # New object
            # Set created_by
            if not obj.created_by:
                obj.created_by = request.user

            # Generate API key if not set
            if not obj.key_hash:
                plaintext_key, prefix, key_hash = APIKey.generate_key()
                obj.prefix = prefix
                obj.key_hash = key_hash

                # Save the object
                super().save_model(request, obj, form, change)

                # Display the plaintext key (ONLY TIME IT'S SHOWN)
                messages.success(
                    request,
                    format_html(
                        '<strong>API Key Generated Successfully!</strong><br><br>'
                        '<strong>IMPORTANT:</strong> Copy this key now. It will never be shown again.<br><br>'
                        '<div style="background-color: #f0f0f0; padding: 15px; margin: 10px 0; '
                        'font-family: monospace; font-size: 14px; border: 2px solid #333;">'
                        '{}'
                        '</div><br>'
                        'Name: {}<br>'
                        'Tenant: {}<br>'
                        'Role: {}',
                        plaintext_key,
                        obj.name,
                        obj.tenant.name,
                        obj.role.name
                    )
                )
            else:
                super().save_model(request, obj, form, change)
        else:
            # Updating existing key
            super().save_model(request, obj, form, change)

    @admin.action(description='Generate new API key (interactive)')
    def generate_new_api_key(self, request, queryset):
        """
        Custom action to generate API keys.
        Note: This is not the primary method - use the 'Add API Key' button instead.
        """
        messages.info(
            request,
            'To generate a new API key, use the "Add API Key" button at the top of the page. '
            'This will guide you through the key generation process.'
        )

    @admin.action(description='Revoke selected API keys (set inactive)')
    def revoke_api_keys(self, request, queryset):
        """Revoke API keys by setting them inactive"""
        count = queryset.update(is_active=False)
        self.message_user(
            request,
            f'Successfully revoked {count} API key(s). They can no longer authenticate.',
            messages.SUCCESS
        )

    @admin.action(description='Activate selected API keys')
    def activate_api_keys(self, request, queryset):
        """Reactivate previously revoked API keys"""
        count = queryset.update(is_active=True)
        self.message_user(
            request,
            f'Successfully activated {count} API key(s). They can now authenticate.',
            messages.SUCCESS
        )

    def has_delete_permission(self, request, obj=None):
        """
        Prevent deletion of API keys to preserve audit trail.
        Use revoke action instead.
        """
        return False

    def get_readonly_fields(self, request, obj=None):
        """
        Make key-related fields readonly after creation.
        """
        readonly = list(self.readonly_fields)

        if obj:  # Editing existing object
            readonly.extend(['tenant', 'role'])

        return readonly
