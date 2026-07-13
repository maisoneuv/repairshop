from django.db import models
from tenants.managers import TenantAwareManager

class Tenant(models.Model):
    name = models.CharField(max_length=255)
    subdomain = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TenantEmailSettings(models.Model):
    DOMAIN_STATUS_CHOICES = [
        ('none', 'Not configured'),
        ('pending', 'Pending verification'),
        ('verified', 'Verified'),
        ('failed', 'Verification failed'),
    ]

    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='email_settings')
    from_name = models.CharField(max_length=255, blank=True)
    # Custom-domain From address; only honored once domain_status == 'verified'
    # and the address is on custom_domain.
    from_email = models.EmailField(blank=True)
    # Local part of the default platform sending address: <slug>@PLATFORM_EMAIL_DOMAIN
    sending_slug = models.SlugField(unique=True, null=True, blank=True)
    # Tenant's real inbox — inbound customer replies are forwarded here.
    reply_forward_email = models.EmailField(blank=True)

    # Optional white-label domain, verified via the Resend Domains API (SPF/DKIM DNS records)
    custom_domain = models.CharField(max_length=253, blank=True)
    resend_domain_id = models.CharField(max_length=64, blank=True)
    domain_status = models.CharField(max_length=20, choices=DOMAIN_STATUS_CHOICES, default='none')
    dns_records = models.JSONField(default=list, blank=True)  # cached records from Resend
    domain_verified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.tenant.name} email settings"

class TenantModelMixin(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE)

    objects = TenantAwareManager()

    class Meta:
        abstract = True