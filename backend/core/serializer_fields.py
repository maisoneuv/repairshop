from rest_framework import serializers


class TenantScopedPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """
    PrimaryKeyRelatedField that restricts the queryset to the request tenant.

    Reads the tenant from serializer context ("tenant" key, falling back to
    request.tenant). If no tenant can be resolved, validation is against an
    empty queryset, so no cross-tenant PK can ever pass.

    Use `tenant_field` for models where the tenant relation is indirect,
    e.g. tenant_field="customer__tenant".
    """

    def __init__(self, tenant_field="tenant", **kwargs):
        self.tenant_field = tenant_field
        super().__init__(**kwargs)

    def get_queryset(self):
        queryset = super().get_queryset()
        if queryset is None:
            return None
        tenant = self.context.get("tenant")
        if tenant is None:
            request = self.context.get("request")
            tenant = getattr(request, "tenant", None) if request else None
        if tenant is None:
            return queryset.none()
        return queryset.filter(**{self.tenant_field: tenant})
