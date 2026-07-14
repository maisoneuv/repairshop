import logging

from django.db import transaction
from rest_framework.exceptions import PermissionDenied

logger = logging.getLogger(__name__)


class TenantScopedMixin:
    """
    Structural tenant scoping for DRF views. Every /api/ view backed by a
    queryset must inherit this mixin (enforced by tenants.test_route_coverage)
    or be explicitly allowlisted there with a justification.

    Behavior:
    - Filters queryset to request.tenant via `tenant_field` (supports related
      paths like "customer__tenant").
    - Superusers: filtered when request.tenant is set (X-Tenant switching),
      unfiltered otherwise if `allow_superuser_unscoped` is True.
    - Reads with no tenant resolved return an empty queryset; writes raise 403.
    - Injects tenant on create (direct `tenant` field only) and blocks moving
      objects across tenants on update.
    - Injects `tenant` into the serializer context.

    Extension pattern: subclasses needing extra filtering (permissions,
    ownership) MUST override get_queryset(), call super().get_queryset()
    first, then narrow the result. Never rebuild the queryset from scratch.
    """
    tenant_field = "tenant"
    allow_superuser_unscoped = True

    def _require_tenant(self):
        tenant = getattr(self.request, "tenant", None)
        if not tenant:
            logger.error(
                "Tenant unresolved for write %s %s (user=%s)",
                self.request.method, self.request.path,
                getattr(self.request, "user", None),
            )
            raise PermissionDenied("Tenant not resolved.")
        return tenant

    def _instance_tenant_id(self, instance):
        """Resolve the tenant id of an instance across a related-field path."""
        obj = instance
        parts = self.tenant_field.split("__")
        for part in parts[:-1]:
            obj = getattr(obj, part, None)
            if obj is None:
                return None
        return getattr(obj, parts[-1] + "_id", None)

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self.request, "tenant", None)
        if tenant:
            return qs.filter(**{self.tenant_field: tenant})
        user = getattr(self.request, "user", None)
        if (
            self.allow_superuser_unscoped
            and user is not None
            and user.is_authenticated
            and user.is_superuser
        ):
            return qs
        logger.error(
            "Tenant unresolved for read %s %s (user=%s); returning empty queryset",
            self.request.method, self.request.path,
            getattr(self.request, "user", None),
        )
        return qs.none()

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["tenant"] = getattr(self.request, "tenant", None)
        return ctx

    def perform_create(self, serializer):
        tenant = self._require_tenant()
        if "__" not in self.tenant_field:
            serializer.save(**{self.tenant_field: tenant})
            return
        # Related-path tenancy (e.g. Asset via customer): can't inject the
        # tenant directly, so save and verify the parent chain, rolling back
        # if the object would land in another tenant.
        with transaction.atomic():
            instance = serializer.save()
            if self._instance_tenant_id(instance) != tenant.id:
                raise PermissionDenied("Object does not belong to your tenant.")

    def perform_update(self, serializer):
        tenant = self._require_tenant()
        instance = serializer.instance
        if self._instance_tenant_id(instance) != tenant.id:
            raise PermissionDenied("Cannot modify objects from another tenant.")
        if "__" not in self.tenant_field:
            # Never allow tenant to be changed via update
            serializer.save(**{self.tenant_field: tenant})
            return
        with transaction.atomic():
            instance = serializer.save()
            if self._instance_tenant_id(instance) != tenant.id:
                raise PermissionDenied("Cannot move objects to another tenant.")
