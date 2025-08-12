from django.db import models

class TenantAwareManager(models.Manager):
    def for_tenant(self, tenant):
        return self.get_queryset().filter(tenant=tenant)

#usage WorkItem.objects.for_tenant(request.tenant)
