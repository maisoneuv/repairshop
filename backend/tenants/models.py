import uuid
from django.db import models
from tenants.managers import TenantAwareManager

class Tenant(models.Model):
    name = models.CharField(max_length=255)
    subdomain = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    def delete(self, *args, force=False, **kwargs):
        """Guard against accidentally wiping an entire tenant.

        Deleting a Tenant CASCADEs across ~30 related models. Require an
        explicit force=True so a stray Tenant.objects.get(...).delete() in a
        shell cannot silently destroy all of a tenant's data.
        """
        if not force:
            raise RuntimeError(
                f"Refusing to delete tenant '{self}' and all its data. "
                "Pass force=True to confirm (this cascades ~30 related models)."
            )
        return super().delete(*args, **kwargs)


class TenantEmailSettings(models.Model):
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='email_settings')
    from_name = models.CharField(max_length=255, blank=True)
    from_email = models.EmailField(blank=True)
    is_verified = models.BooleanField(default=False)
    verification_token = models.UUIDField(default=uuid.uuid4, editable=False)
    verification_sent_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.tenant.name} email settings"

class TenantModelMixin(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE)

    objects = TenantAwareManager()

    class Meta:
        abstract = True