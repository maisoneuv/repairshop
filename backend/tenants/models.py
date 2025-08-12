from django.db import models
from tenants.managers import TenantAwareManager

class Tenant(models.Model):
    name = models.CharField(max_length=255)
    subdomain = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class TenantModelMixin(models.Model):
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE)

    objects = TenantAwareManager()

    class Meta:
        abstract = True