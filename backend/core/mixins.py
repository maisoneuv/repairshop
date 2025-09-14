from rest_framework.exceptions import ValidationError, PermissionDenied


class TenantScopedMixin:
    """
       Re-usable mixin for DRF ViewSets:
       - Filters queryset to request.tenant
       - Injects tenant on create
       - Prevents tenant changes on update
       - Ensures object lookup can't cross tenants (via get_queryset())
       """
    tenant_field = "tenant"

    def _require_tenant(self):
        tenant = getattr(self.request, "tenant", None)
        if not tenant:
            raise ValidationError({"detail": "Tenant not resolved"})
        return tenant

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self.request, "tenant", None)
        if tenant:
            return qs.filter(**{self.tenant_field: tenant})
        # For safety, return empty queryset when no tenant
        return qs.none()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["tenant"] = getattr(self.request, "tenant", None)
        return ctx

    def perform_create(self, serializer):
        tenant = self._require_tenant()
        serializer.save(**{self.tenant_field: tenant})

    def perform_update(self, serializer):
        tenant = self._require_tenant()
        instance = self.get_object()
        if getattr(instance, self.tenant_field + "_id") != tenant.id:
            raise PermissionDenied("Cannot modify objects from another tenant.")
        # Never allow tenant to be changed via update
        serializer.save(**{self.tenant_field: tenant})