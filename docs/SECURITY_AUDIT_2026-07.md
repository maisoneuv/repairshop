# Security Audit — Backend (2026-07-01)

Reviewer: Claude (security review). Scope: Django/DRF backend — authentication,
tenant isolation, API surface, finance/customer data handling, configuration.

This document is a backlog for later development. Findings are ranked by severity.
Each item lists the location, the risk, and a suggested fix. Nothing here has been
changed in the code yet.

---

## Verdict on suitability for customer + finance data

**Not production-ready for storing customer or financial data in its current state.**

There are two independent classes of defect that both lead to cross-tenant data
exposure:

1. **Unauthenticated API access** — DRF has no default permission class, so several
   endpoints (most importantly `NoteViewSet`) are reachable with no login and, in at
   least one case, no tenant scoping at all.
2. **Cross-tenant writes via serializer foreign keys** — related fields are validated
   against `Model.objects.all()` instead of the caller's tenant, so a user in tenant A
   can link work items/tasks/assets/**cash registers** to tenant B's records.

Either one alone is a blocker for holding real customer or finance data. Both are
fixable without architectural change — the tenant model itself (middleware +
`TenantScopedMixin`) is sound; the problem is endpoints and serializers that bypass it.

The items under **Critical** and **High** should be closed, and a cross-tenant
integration test added, before this handles real data.

---

## Critical

### C-1. No DRF default permission class → public endpoints
**Where:** `backend/app/settings.py:184` (`REST_FRAMEWORK` has no `DEFAULT_PERMISSION_CLASSES`).
DRF's built-in default is `AllowAny`, so every ViewSet that does not set
`permission_classes` is anonymously reachable.

**Affected ViewSets missing `permission_classes`:** `NoteViewSet` (`core/views.py:112`),
`WorkItemViewSet` (`tasks/views.py:291`), `TaskViewSet` (`tasks/views.py:699`),
`TaskTypeViewSet` (`tasks/views.py:906`), `AssetViewSet` (`customers/views.py:86`),
`CustomerViewSet` (`customers/views.py:301`), `CustomFieldViewSet` (`core/views.py:776`),
`CustomerAPISearchView` (`customers/views.py:262`).

**Worst case — `NoteViewSet`:** no `permission_classes` **and** no tenant filter in
`get_queryset` (filters only by `content_type` + `object_id`). An unauthenticated
attacker can iterate object IDs via `GET /…/notes/workitem/<id>/` and read notes from
**any tenant**. Notes hold customer/repair detail → unauthenticated cross-tenant leak.

**`WorkItemViewSet` bypass:** `get_queryset` line 338 returns tenant-filtered work items
whenever `?search=` is present, with no auth — `GET /…/workitems/?search=RMA` + an
`X-Tenant` header returns that tenant's work items to an anonymous caller.

**Fix:**
- Add `'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated']`
  to `REST_FRAMEWORK`.
- Add explicit tenant scoping to `NoteViewSet.get_queryset` (filter notes to
  `request.tenant`, and verify the parent object belongs to the tenant).
- Audit each ViewSet listed above for explicit `permission_classes`.

### C-2. Cross-tenant writes via unscoped serializer foreign keys
**Where:** serializer `PrimaryKeyRelatedField`s use `queryset=Model.objects.all()`:
- `tasks/serializers.py` — `WorkItemSerializer`: `owner_id`, `technician_id`,
  **`payment_register_id`** (lines 97–113); `TaskSerializer`: `assigned_employee_id`,
  `task_type_id` (lines 327–334, 357).
- `customers/serializers.py` — `AssetSerializer`: `customer_id`, `device_id` (lines 65–72).
- `service/serializers.py` — `CashTransferSerializer`: `source_register`,
  `destination_register` (208–212) *(mitigated at the view — see note)*.

DRF validates the submitted PK against the field's queryset. With `objects.all()`, the
queryset spans **all tenants**, so a user in tenant A can submit a PK belonging to
tenant B and it passes validation. `perform_create` sets `tenant=request.tenant` on the
new row, but the FK still points across the tenant boundary.

`WorkItemSerializer.__init__`/`validate` only re-scope and re-check **`fulfillment_shop_id`**
(lines 137–146). `owner_id`, `technician_id`, and `payment_register_id` are **not**
checked.

**Finance impact:** `payment_register_id` can reference another tenant's `CashRegister`.
`WorkItemViewSet._handle_auto_transactions` then posts cash transactions against that
register → an attacker writes financial records into another tenant's cash register and
can read the resulting balances back. This is a cross-tenant integrity + disclosure bug
on financial data specifically.

**Note:** `CashTransferSerializer` uses `objects.all()` too, but
`transfer_between_registers` (`service/views.py:616`) re-checks
`source.tenant == request.tenant` — so that path is covered. It's the model for what the
others should do, but doing it per-view is fragile.

**Fix (preferred):** scope every related field's queryset to `request.tenant` in the
serializer `__init__` (as already done for `fulfillment_shop_id`), or add a
`validate_<field>` / `validate()` tenant check for each FK. Best long-term: a shared
`TenantScopedPrimaryKeyRelatedField` that reads tenant from serializer context and
filters automatically, used everywhere.

---

## High

### H-1. Lock-screen PIN is brute-forceable; no rate limiting anywhere
**Where:** `list_pinned_users_view` (`core/views.py:365`, `@permission_classes([])`)
publicly returns valid user IDs + names. `quick_login_view` (`core/views.py:272`,
`@permission_classes([])`) accepts a 4–6 digit PIN for a given `user_id`. No throttling
exists in the project (no DRF throttle classes, no `django-axes`, no `django-ratelimit`).

**Risk:** enumerated user IDs + a 4-digit PIN (10,000 values) with no lockout = trivially
brute-forced account takeover.

**Fix:** add throttling/lockout on `quick_login_view` and `login_view` (DRF
`ScopedRateThrottle` or `django-axes`); stop publicly enumerating users, or gate the
pinned-users list behind tenant + a short-lived token; consider a PIN attempt counter
with temporary lock.

### H-2. Credentials and request metadata written to logs
**Where:**
- `login_view` (`core/views.py:250-251`) `print`s username **and password** on every login.
- `NoteViewSet.perform_create` (`core/views.py:146`) `print`s the user.
- `TenantMiddleware` (`tenants/middleware.py:43,52,66,74,81,86`) logs host/header/user on
  **every request** at `WARNING`.

**Risk:** plaintext passwords in stdout/log aggregation; PII and request metadata noise at
WARNING level.

**Fix:** remove the credential/user `print`s entirely; lower middleware logging to `debug`
and strip header/user values or hash them.

---

## Medium

### M-1. `SECRET_KEY` is silently a tuple
**Where:** `backend/app/settings.py:28`
```python
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY'),   # trailing comma!
```
The trailing comma makes `SECRET_KEY` a one-element tuple. `if not SECRET_KEY:` (line 29)
is therefore always false (non-empty tuple is truthy), so the "fail if unset" guard never
fires, and the signing key becomes `(value,)` / `(None,)`.

**Fix:** remove the trailing comma so the guard works and the key is a string.

### M-2. Unrestricted HTML in templates → stored/reflected XSS
**Where:** `CKEDITOR_CONFIGS` (`settings.py:241`) sets `allowedContent: True`,
`extraAllowedContent: 'style(*);*(*);*{*}'`, `fullPage: True` — no sanitization.
`preview_anonymous` (`documents/views.py:262`) reflects arbitrary posted `html_content`
back as `Content-Type: text/html` on the app origin; saved templates render the same way.

**Risk:** script stored in a form template executes for anyone viewing/printing it;
reflected HTML gives a same-origin XSS primitive.

**Fix:** sanitize template HTML with an allowlist (e.g. `bleach`) before storing and
before rendering; avoid returning user HTML with `text/html` on the app origin, or serve
generated documents from a separate origin.

---

## Low / Hardening

- **L-1. Spoofable audit IP.** `APIKeyAuthentication.get_client_ip`
  (`core/authentication.py:180`) trusts the first `X-Forwarded-For` value, so
  `APIKey.last_used_ip` is attacker-controllable and not reliable for forensics. Use a
  trusted-proxy count / `REMOTE_ADDR` behind a known proxy.
- **L-2. Missing security headers.** No `SECURE_HSTS_SECONDS`, `SECURE_SSL_REDIRECT`, or
  `SECURE_CONTENT_TYPE_NOSNIFF`. (`SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` are
  correctly tied to non-DEBUG.) Add the standard Django deployment-checklist headers.
- **L-3. Related-field existence oracle.** Because serializer FK querysets are
  `objects.all()` (see C-2), validation errors reveal whether an ID exists in another
  tenant. Fixed for free once C-2 is addressed.

---

## What is already sound (keep)

- API keys are hashed with `make_password` / `check_password` and looked up by an indexed
  prefix (`core/models.py`, `core/authentication.py`) — no plaintext key storage.
- `TenantMiddleware` locks authenticated non-superusers to their own tenant and enforces
  membership; a stale/spoofed `X-Tenant` header can't redirect them
  (`tenants/middleware.py:59-101`).
- `TenantScopedMixin` filters querysets, injects tenant on create, and blocks tenant
  changes on update (`core/mixins.py`).
- `transfer_between_registers` re-validates register tenancy at the view
  (`service/views.py:616`) — the pattern the serializers should follow.
- CORS is env-driven (not wildcard), correct alongside `CORS_ALLOW_CREDENTIALS = True`.

---

## Suggested order of work

1. C-1 — add `DEFAULT_PERMISSION_CLASSES` + scope `NoteViewSet` (biggest, cheapest win).
2. C-2 — tenant-scope serializer FK querysets (shared field class).
3. H-1 — throttle/lock login + PIN endpoints.
4. H-2 / M-1 — remove credential logging; fix `SECRET_KEY`.
5. M-2, L-1..L-3 — sanitization and hardening.
6. Add a regression test: user in tenant A must get 403/404 for tenant B's work items,
   notes, cash registers, and must not be able to reference them via serializer FKs.
