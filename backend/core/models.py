from django.conf import settings
from django.contrib.auth import get_user_model
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
    apartment_number = models.CharField(max_length=50, blank=True)
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