from django.db import models


class TenantAwareManager(models.Manager):
    """
    Tenant helpers for tenant-scoped models.

    NOTE: the default queryset is NOT tenant-filtered. `Model.objects.all()`
    returns rows for every tenant — scoping is enforced at the view layer by
    core.mixins.TenantScopedMixin (see tenants/test_route_coverage.py).
    Use `for_tenant()` / `for_request()` when querying outside a scoped view.
    """

    def for_tenant(self, tenant):
        return self.get_queryset().filter(tenant=tenant)

    def for_request(self, request):
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            raise ValueError(
                "request.tenant is not resolved; refusing to build an "
                "unscoped queryset. Check TenantMiddleware / authentication."
            )
        return self.for_tenant(tenant)
