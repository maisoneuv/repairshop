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
        logger.debug("TenantMiddleware incoming host=%s", request.get_host())

        # 0) Check if request is authenticated via API key
        # API keys are set by DRF authentication (request.auth)
        # This must run AFTER authentication middleware
        api_key = getattr(request, "auth", None)
        if api_key and hasattr(api_key, "tenant"):
            # API key determines the tenant
            request.tenant = api_key.tenant
            logger.debug("TenantMiddleware using API key tenant %s", api_key.tenant)
            # Skip all other tenant resolution and membership checks for API keys
            return

        user = getattr(request, "user", None)
        is_authenticated = bool(user and user.is_authenticated)

        # 1) Authenticated non-superusers are locked to their own tenant.
        #    This prevents a stale or spoofed X-Tenant header from redirecting
        #    them to another tenant's data.
        if is_authenticated and not user.is_superuser:
            user_tenant = getattr(user, "tenant", None)
            if user_tenant:
                request.tenant = user_tenant
                logger.debug("TenantMiddleware using user's own tenant %s", user_tenant)

        # 2) Header hint — used for unauthenticated requests and superusers
        #    (superusers may legitimately switch between tenants via the header).
        if request.tenant is None:
            header_slug = request.META.get("HTTP_X_TENANT")
            if header_slug:
                request.tenant = Tenant.objects.filter(subdomain=header_slug).first()
                logger.debug("TenantMiddleware header slug %s -> %s", header_slug, request.tenant)

        # 3) Host fallback (multi-tenant via subdomain)
        if request.tenant is None:
            slug = _derive_slug_from_host(request.get_host())
            if slug:
                request.tenant = Tenant.objects.filter(subdomain=slug).first()
                logger.debug("TenantMiddleware host slug %s -> %s", slug, request.tenant)

        # 3b) Fallback to a configured default tenant when running without subdomains.
        if request.tenant is None and DEFAULT_TENANT_SUBDOMAIN:
            request.tenant = Tenant.objects.filter(subdomain=DEFAULT_TENANT_SUBDOMAIN).first()
            logger.debug("TenantMiddleware default slug %s -> %s", DEFAULT_TENANT_SUBDOMAIN, request.tenant)

        # 4) Enforce membership for authenticated non-superusers.
        if (
            request.tenant
            and is_authenticated
            and not user.is_superuser
            and not any(request.path.startswith(p) for p in TENANT_OPTIONAL_PATHS)
        ):
            from core.models import UserRole  # lazy import to avoid circular dependency
            has_access = (
                getattr(user, "tenant_id", None) == request.tenant.pk
                or UserRole.objects.filter(user=user, role__tenant=request.tenant).exists()
            )
            if not has_access:
                raise PermissionDenied("You don't have access to this tenant.")
