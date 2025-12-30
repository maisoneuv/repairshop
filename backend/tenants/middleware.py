from typing import Optional
import logging
from django.conf import settings
from django.utils.deprecation import MiddlewareMixin
from django.core.exceptions import PermissionDenied
from django.http import HttpRequest

from tenants.models import Tenant

logger = logging.getLogger(__name__)

TENANT_OPTIONAL_PATHS = (
    "/auth/login",
    "/auth/logout",
    "/auth/session",
    "/auth/csrf",
    "/accounts/login",
    "/accounts/logout",
    "/dj-rest-auth/login/",
    "/dj-rest-auth/logout/",
)

DEFAULT_TENANT_SUBDOMAIN = getattr(settings, "DEFAULT_TENANT_SUBDOMAIN", None)

def _derive_slug_from_host(host: str) -> Optional[str]:
    host = (host or "").split(":")[0]
    if host in ("localhost", "127.0.0.1", "[::1]"):
        return None  # let client/env decide dev tenant
    parts = host.split(".")
    if "localhost" in parts:  # e.g. repairhero.localhost
        return parts[0] if parts[0] != "localhost" else None
    if parts and parts[0] in ("www", "app"):
        parts = parts[1:]
    if len(parts) >= 3:  # foo.api.example.com -> foo
        return parts[0]
    return None

class TenantMiddleware(MiddlewareMixin):
    def process_request(self, request: HttpRequest):

        request.tenant = None
        header_val = request.META.get("HTTP_X_TENANT")
        logger.warning("TenantMiddleware incoming host=%s header=%s user=%s", request.get_host(), header_val, getattr(request, "user", None))

        # 0) Check if request is authenticated via API key
        # API keys are set by DRF authentication (request.auth)
        # This must run AFTER authentication middleware
        api_key = getattr(request, "auth", None)
        if api_key and hasattr(api_key, "tenant"):
            # API key determines the tenant
            request.tenant = api_key.tenant
            logger.warning("TenantMiddleware using API key tenant %s", api_key.tenant)
            # Skip all other tenant resolution and membership checks for API keys
            return

        # 1) If authenticated, prefer the user's active tenant
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            active = getattr(user, "active_tenant", None)
            if active:
                request.tenant = active
                logger.warning("TenantMiddleware using active tenant %s", active)

        # 2) Header hint (when not set yet)
        if request.tenant is None:
            header_slug = request.META.get("HTTP_X_TENANT")
            if header_slug:
                request.tenant = Tenant.objects.filter(subdomain=header_slug).first()
                logger.warning("TenantMiddleware header slug %s -> %s", header_slug, request.tenant)

        # 3) Host fallback (multi-tenant via subdomain)
        if request.tenant is None:
            slug = _derive_slug_from_host(request.get_host())
            if slug:
                request.tenant = Tenant.objects.filter(subdomain=slug).first()
                logger.warning("TenantMiddleware host slug %s -> %s", slug, request.tenant)

        # 3b) Fallback to a configured default tenant when running without subdomains.
        if request.tenant is None and DEFAULT_TENANT_SUBDOMAIN:
            request.tenant = Tenant.objects.filter(subdomain=DEFAULT_TENANT_SUBDOMAIN).first()
            logger.warning("TenantMiddleware default slug %s -> %s", DEFAULT_TENANT_SUBDOMAIN, request.tenant)

        # 4) Enforce membership only when authenticated and not on optional paths
        if (
            request.tenant
            and user
            and user.is_authenticated
            and not any(request.path.startswith(p) for p in TENANT_OPTIONAL_PATHS)
        ):
            if not user.tenants.filter(pk=request.tenant.pk).exists():
                raise PermissionDenied("You don't have access to this tenant.")
