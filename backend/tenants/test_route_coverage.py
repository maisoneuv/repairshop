"""
Structural guardrail for tenant isolation (architecture review finding 1.1).

Every view registered under /api/ must either:
  - inherit core.mixins.TenantScopedMixin (queryset auto-scoped to
    request.tenant), or
  - be listed in GLOBAL_ALLOWLIST (intentionally cross-tenant), or
  - be listed in AUDITED_VIEWS (manually verified to constrain every ORM
    access by request.tenant; each entry must cite where the filtering
    happens).

If this test fails for a view you just added: inherit TenantScopedMixin.
Only add an allowlist entry when the endpoint is genuinely global or cannot
carry a queryset, and say why in the comment.
"""
from django.conf import settings
from django.test import SimpleTestCase
from django.urls import URLPattern, URLResolver, get_resolver

from core.mixins import TenantScopedMixin

# Views that are intentionally NOT tenant-scoped. Format: "module.ClassName".
GLOBAL_ALLOWLIST = {
    # Device is a deliberately global, shared catalog (see architecture
    # review finding 1.6 for its tenant-scoped Category FK follow-up)
    "inventory.views.DeviceAPISearchView",
    "inventory.views.DeviceCreateListView",
    "inventory.views.DeviceRetrieveUpdateAPIView",
    "inventory.views.manufacturer_search",
    # Global Django permission catalog (read-only, no tenant data)
    "core.views.PermissionViewSet",
    # Pre-auth / session endpoints, no tenant data exposed
    "core.views.login_view",            # rejects cross-tenant logins internally
    "core.views.logout_view",
    "core.views.PasswordResetConfirmView",  # uid+signed-token flow
    # Static HTML renders, no ORM access
    "core.views.home_view",
    "core.views.react_app_view",
    # Static model choices, no tenant data
    "customers.views.get_referral_sources",
    # Framework-provided index/schema endpoints
    "rest_framework.routers.APIRootView",
    "drf_spectacular.views.SpectacularAPIView",
    "drf_spectacular.views.SpectacularSwaggerView",
}

# APIViews / function views without a queryset, manually audited to scope by
# request.tenant. Each value cites the filtering location.
AUDITED_VIEWS = {
    # calls app: every ORM access is tenant= request.tenant (calls/views.py)
    "calls.views.incoming_call",        # Call created with tenant=request.tenant
    "calls.views.debug_incoming_call",  # no ORM access (echo endpoint)
    "calls.views.pending_calls",        # filter(tenant=request.tenant)
    "calls.views.mark_handled",         # get(pk=..., tenant=request.tenant)
    "calls.views.update_call",          # get(pk=..., tenant=request.tenant)
    "calls.views.complete_after_call",  # get(pk=..., tenant=request.tenant)
    # core
    "core.views.NoteViewSet",           # parent object tenant-verified in _get_parent_content_type
    "core.views.SettingViewSet",        # global+tenant rows by design; writes restricted to own tenant rows
    "core.views.PicklistAdminViewSet",  # every query filters tenant=request.tenant
    "core.views.PicklistValuesView",    # filter(tenant=request.tenant)
    "core.views.GlobalSearchView",      # search services take tenant arg (customers/tasks services.py)
    "core.views.MyPermissionsView",     # filters rolepermission__role__tenant=request.tenant
    "core.views.EmailMessageListView",  # filter(tenant=request.tenant)
    "core.views.SendEmailView",         # FormDocument + EmailMessage scoped to request.tenant
    "core.photo_views.PhotoListCreateView",      # _resolve_parent + filter(tenant=request.tenant)
    "core.photo_views.PhotoDetailView",          # get(pk, tenant=request.tenant)
    "core.photo_views.PhotoFileView",            # filter(tenant=request.tenant); superuser only when no X-Tenant
    "core.photo_views.PhotoUploadLinkCreateView",  # _resolve_parent scopes object to request.tenant
    "core.photo_views.MobilePhotoUploadView",    # token (resolve_upload_link) is the sole tenant-scoped credential
    "core.views.TenantEmailSettingsView",       # get_or_create(tenant=request.tenant), manage_users gated
    "core.views.SendEmailVerificationView",     # get_or_create(tenant=request.tenant), manage_users gated
    "core.views.VerifyEmailAddressView",        # lookup by unguessable verification_token (email link)
    "core.views.TriggerPasswordResetView",      # User.objects.get(pk, tenant=request.tenant)
    "core.views.quick_login_view",      # PIN login constrained to request.tenant users
    "core.views.session_ping",          # session state only
    "core.views.set_my_pin_view",       # own user only
    "core.views.set_user_pin_view",     # rejects users of other tenants
    "core.views.list_pinned_users_view",  # filter(tenant=request.tenant | tenant__isnull=True)
    # customers
    "customers.views.customer_assets_api",  # get_object_or_404(Customer, tenant=request.tenant)
    "customers.views.customer_lookup",      # tenant-checked lookup
    # documents
    "documents.views.WorkItemFormDocumentViewSet",  # _get_work_item scopes by request.tenant
    # integrations
    "integrations.views.SummaryCallbackView",   # unguessable request_id + tenant match check
    "integrations.views.CustomActionListView",  # filter(tenant=request.tenant)
    "integrations.views.CustomActionExecuteView",  # get_object_or_404(tenant=request.tenant)
    # inventory (all scoped in inventory/views.py)
    "inventory.views.WorkItemPartsView",        # filter(tenant=request.tenant)
    "inventory.views.WorkItemPartDeleteView",   # get(..., tenant=request.tenant)
    "inventory.views.StockAdjustmentView",      # item/list/balance/transaction all tenant-scoped
    "inventory.views.SKUResolveView",           # get(tenant=request.tenant, sku=...)
    "inventory.views.ReceiveDeliveryView",      # items/lists/POs/balances all tenant-scoped
    "inventory.views.UserDefaultLocationView",  # Employee.get(user, tenant=request.tenant)
    # service (all scoped in service/views.py)
    "service.views.EmployeeSearchView",
    "service.views.EmployeeListView",
    "service.views.CurrentEmployeeView",
    "service.views.LocationSearchView",
    "service.views.ShopSearchView",
    "service.views.create_freeform_location",
    "service.views.ensure_customer_address_location",  # address scoped via tenant-checked customer
    "service.views.transfer_between_registers",        # registers verified against request.tenant
    # tasks
    "tasks.views.DashboardView",        # all WorkItem/Task/PicklistValue queries filter tenant
    "tasks.views.WorkItemSchemaView",   # get_model_schema(tenant=request.tenant)
    "tasks.views.TaskSchemaView",       # get_model_schema(tenant=request.tenant)
}


def _collect_api_views(patterns, prefix=""):
    """Yield (route, callback) for every URL pattern under api/."""
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from _collect_api_views(
                entry.url_patterns, prefix + str(entry.pattern)
            )
        elif isinstance(entry, URLPattern):
            route = prefix + str(entry.pattern)
            if route.startswith("api/"):
                yield route, entry.callback


def _view_key(callback):
    """Stable identifier: 'module.ClassName' or 'module.function_name'."""
    cls = getattr(callback, "cls", None) or getattr(callback, "view_class", None)
    if cls is not None:
        return f"{cls.__module__}.{cls.__name__}", cls
    func = getattr(callback, "__wrapped__", callback)
    return f"{func.__module__}.{func.__name__}", None


class RouteCoverageTest(SimpleTestCase):
    """Fails the suite if any /api/ route is neither scoped nor allowlisted."""

    def _api_views(self):
        resolver = get_resolver(settings.ROOT_URLCONF)
        seen = {}
        for route, callback in _collect_api_views(resolver.url_patterns):
            key, cls = _view_key(callback)
            seen.setdefault(key, (cls, []))[1].append(route)
        return seen

    def test_every_api_route_is_tenant_scoped_or_allowlisted(self):
        problems = []
        for key, (cls, routes) in self._api_views().items():
            if cls is not None and issubclass(cls, TenantScopedMixin):
                continue
            if key in GLOBAL_ALLOWLIST or key in AUDITED_VIEWS:
                continue
            problems.append(f"  {key}\n    routes: {', '.join(sorted(routes))}")
        if problems:
            self.fail(
                "Unscoped API views (inherit TenantScopedMixin, or add to "
                "GLOBAL_ALLOWLIST/AUDITED_VIEWS in tenants/test_route_coverage.py "
                "with a justification):\n" + "\n".join(sorted(problems))
            )

    def test_allowlists_are_not_stale(self):
        seen = self._api_views()
        stale = []
        for key in list(GLOBAL_ALLOWLIST) + list(AUDITED_VIEWS):
            if key not in seen:
                stale.append(f"  {key}: no longer registered under /api/")
                continue
            cls, _ = seen[key]
            if cls is not None and issubclass(cls, TenantScopedMixin):
                stale.append(f"  {key}: now inherits TenantScopedMixin — remove entry")
        if stale:
            self.fail("Stale allowlist entries:\n" + "\n".join(sorted(stale)))
