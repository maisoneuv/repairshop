from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password, check_password
from django.core.validators import RegexValidator
from django.db import models
from django.contrib.auth.models import (
    AbstractUser,
    PermissionsMixin,
    BaseUserManager
)
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.contrib.auth.models import Permission
from django.utils import timezone
import secrets


from tenants.models import Tenant


class UserManager(BaseUserManager):

    def create_user(self, email, password=None, tenant=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')

        email = self.normalize_email(email)
        user = self.model(email=email, tenant=tenant, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)

        return user

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        return self.create_user(email, password, **extra_fields)


class User(AbstractUser, PermissionsMixin):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, null=True, blank=True)
    email = models.EmailField(unique=True, max_length=255, verbose_name='email address')
    company = models.CharField(max_length=255, null=True)
    name = models.CharField(max_length=255, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    phone_regex = RegexValidator(
        regex=r'\d{7,9}$',
        message='Phone number must be entered without any special characters. Up to 9 digits allowed'
    )

    phone_number = models.CharField(max_length=9, null=True, blank=True, validators=[phone_regex])

    objects = UserManager()
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    def has_permission(self, permission_codename, tenant):
        if self.is_superuser:
            return True
        return UserRole.objects.filter(
            user=self,
            role__tenant=tenant,
            role__role_permissions__permission__codename=permission_codename
        ).exists()
        #if not request.user.has_permission('manage_users', request.tenant):
        #raise PermissionDenied()


class Address(models.Model):
    street = models.CharField(max_length=255)
    city = models.CharField(max_length=100)
    building_number = models.CharField(max_length=50)
    apartment_number = models.CharField(max_length=50, blank=True, null=True)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=100, default="Poland")

    def __str__(self):
        return f"{self.street} {self.building_number} {self.city}"


class TimeStampedModel(models.Model):
    created_on = models.DateTimeField(auto_now_add=True)
    modified_on = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

class Note(models.Model):
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    # Generic relation
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        ordering = ["-created_at"]


class PicklistValue(models.Model):
    """
    Tenant-specific customizable picklist values for dropdown fields.
    Allows admins to define custom status values, currencies, and other dropdown options.
    This is a generic model that can be used by any app for customizable dropdown fields.
    """
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    category = models.CharField(max_length=50, help_text="Type of picklist (e.g., 'workitem_status', 'task_status', 'currency')")
    name = models.CharField(max_length=100, help_text="Display label shown to users")
    value = models.CharField(max_length=100, help_text="Internal value stored in database")
    sort_order = models.IntegerField(default=0, help_text="Controls display order in dropdowns (lower numbers appear first)")
    is_active = models.BooleanField(default=True, help_text="Only active values can be selected by users")
    is_system = models.BooleanField(default=False, help_text="System-protected values that should not be deleted")
    created_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category', 'sort_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'category', 'value'],
                name='unique_picklist_value_per_tenant_category'
            )
        ]
        indexes = [
            models.Index(fields=['tenant', 'category', 'is_active'], name='idx_picklist_tenant_cat_active'),
        ]

    def __str__(self):
        return f"{self.category}: {self.name} ({self.tenant})"


class Role(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='roles')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    class Meta:
        unique_together = ('tenant', 'name')

    def __str__(self):
        return f"{self.name} ({self.tenant.name})"


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='role_permissions')
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE)

    class Meta:
        unique_together = ('role', 'permission')

    def __str__(self):
        return f"{self.role.name} → {self.permission.codename}"

class UserRole(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='user_roles')
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='user_roles')

    class Meta:
        unique_together = ('user', 'role')

    def __str__(self):
        return f"{self.user.email} → {self.role.name} ({self.role.tenant.name})"


class APIKey(TimeStampedModel):
    """
    API keys for external system authentication.
    Each key is tenant-scoped and has role-based permissions.
    """
    # Identity
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='api_keys',
        help_text="Tenant this API key belongs to"
    )
    name = models.CharField(
        max_length=255,
        help_text="Descriptive name (e.g., 'n8n Production Integration')"
    )

    # Security - key storage
    key_hash = models.CharField(
        max_length=255,
        unique=True,
        help_text="Hashed API key (never store plaintext)"
    )
    prefix = models.CharField(
        max_length=12,
        db_index=True,
        help_text="Key prefix for identification (e.g., 'sk_live_abcd')"
    )

    # Permissions - reuse existing role system
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name='api_keys',
        help_text="Role determines what permissions this API key has"
    )

    # Optional integration link
    integration = models.ForeignKey(
        'integrations.TenantIntegration',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='api_keys',
        help_text="Optional: Link to outbound integration for bidirectional flows"
    )

    # Status
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive keys cannot authenticate"
    )
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Optional expiration date for this key"
    )

    # Audit - minimal security tracking
    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this key was used successfully"
    )
    last_used_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address of last successful use"
    )
    usage_count = models.IntegerField(
        default=0,
        help_text="Total number of successful authentications"
    )

    # Metadata
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_api_keys',
        help_text="User who created this API key"
    )
    notes = models.TextField(
        blank=True,
        help_text="Optional notes about this API key"
    )

    class Meta:
        ordering = ['-created_on']
        verbose_name = "API Key"
        verbose_name_plural = "API Keys"
        indexes = [
            models.Index(fields=['tenant', 'is_active']),
            models.Index(fields=['prefix']),
        ]

    def __str__(self):
        return f"{self.name} ({self.prefix}...)"

    @staticmethod
    def generate_key(environment='live'):
        """
        Generate a new API key with Stripe-style format.
        Returns: (plaintext_key, prefix, key_hash)

        Format: sk_{environment}_{32-char-random}
        Example: sk_live_abcdef1234567890abcdef1234567890
        """
        # Generate secure random string (32 characters)
        random_part = secrets.token_hex(16)  # 16 bytes = 32 hex chars

        # Create full key with prefix
        plaintext_key = f"sk_{environment}_{random_part}"

        # Create displayable prefix (first 12 chars)
        prefix = plaintext_key[:12]

        # Hash the key for storage
        key_hash = make_password(plaintext_key)

        return plaintext_key, prefix, key_hash

    def check_key(self, plaintext_key):
        """
        Validate a plaintext key against this API key's hash.

        Args:
            plaintext_key: The plaintext API key to validate

        Returns:
            bool: True if key matches, False otherwise
        """
        return check_password(plaintext_key, self.key_hash)

    def is_valid(self):
        """
        Check if this API key is currently valid.

        Returns:
            bool: True if active and not expired, False otherwise
        """
        if not self.is_active:
            return False

        if self.expires_at and timezone.now() > self.expires_at:
            return False

        return True

    def update_usage(self, ip_address=None):
        """
        Update usage tracking for this API key.

        Args:
            ip_address: Optional IP address to record
        """
        self.last_used_at = timezone.now()
        self.usage_count += 1

        if ip_address:
            self.last_used_ip = ip_address

        # Use update to avoid triggering modified_on
        APIKey.objects.filter(pk=self.pk).update(
            last_used_at=self.last_used_at,
            last_used_ip=self.last_used_ip,
            usage_count=self.usage_count
        )

    def has_permission(self, permission_codename, tenant=None):
        """
        Check if this API key has a specific permission.
        Delegates to the associated role's permissions.

        Args:
            permission_codename: Django permission codename (e.g., 'tasks.add_workitem')
            tenant: Tenant to check (defaults to API key's tenant)

        Returns:
            bool: True if permission granted, False otherwise
        """
        # API keys are never superusers
        if tenant is None:
            tenant = self.tenant

        # Check if this API key's tenant matches the requested tenant
        if self.tenant != tenant:
            return False

        # Check if role has this permission
        return RolePermission.objects.filter(
            role=self.role,
            permission__codename=permission_codename
        ).exists()