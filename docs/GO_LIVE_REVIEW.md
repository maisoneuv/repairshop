# Pre-Go-Live Functional & Security Review — Fixed Service

## Context

Product-owner-style review of the multi-tenant service management app (Django REST + React) ahead of go-live. Covers security gaps, functional gaps, improvements to existing features, and new feature suggestions. Based on a full codebase sweep (backend apps: core, tenants, customers, tasks, service, inventory, integrations, documents, calls; frontend: 132 JSX/JS files) with high-severity claims verified directly against source.

**Review date:** 2026-07-07 (branch: `user-management`)

---

## Executive Summary

The core product is solid: work item (RMA) lifecycle, kanban task boards, customer/asset management, cash registers, inventory ledger, role-based permissions, a well-tested new email feature, and a strong tenant-isolation middleware. However there are **3 security blockers and 4 functional blockers** that should be resolved before real customer data goes live. The biggest systemic risks are: no API pagination anywhere, no request throttling anywhere, and a stored-XSS chain through document templates.

---

## 🔴 Security — Go-Live Blockers (P0)

1. **`SECRET_KEY` is a tuple, and the safety check is dead** — `backend/app/settings.py:28` has a trailing comma: `SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY'),`. This makes SECRET_KEY a tuple; worse, `(None,)` is truthy so the `if not SECRET_KEY: raise` on line 29–30 **never fires** — the app will boot with no secret key set. One-character fix; must ship.

2. **No global DRF permission default** — `DEFAULT_PERMISSION_CLASSES` is unset in settings.py, so any view/viewset missing an explicit `permission_classes` defaults to `AllowAny`. Set `IsAuthenticated` globally and explicitly opt-out the few public endpoints (login, reset-confirm, quick-login, pinned-users, webhooks).

3. **PIN quick-login is brute-forceable** — `core/views.py:604` `quick_login_view` is unauthenticated, takes `user_id` + 4–6 digit PIN, and there is **zero throttling anywhere in the app** (no `DEFAULT_THROTTLE_CLASSES`, verified). A 4-digit PIN falls in ≤10k requests. Companion issue: `/api/core/users/pinned/` (`core/views.py:697`) is unauthenticated and enumerates valid user IDs + names for the attack. Fix: DRF throttling + per-user lockout/backoff on failed PINs; require auth or a tenant-scoped opaque token for the pinned-users list.

4. **Stored XSS chain via document templates** — CKEditor config (`settings.py:288-290`) uses `allowedContent: True` + `fullPage: True` (no sanitization of tenant-authored template HTML), and `documents/variables.py:389-392` substitutes `{{variables}}` (customer names, descriptions…) into that HTML **without escaping**. A customer named `<img src=x onerror=…>` executes in template previews and generated documents. Note: `backend/documents/sanitizer.py` **does not exist on disk** (there's an empty IDE tab for it — the intended fix was never written). Fix: escape variable values on substitution; sanitize template HTML (nh3 is already a dependency).

## 🟠 Security — High (fix before or immediately after launch)

5. **Integration secrets stored in plaintext** — `integrations/models.py:59` keeps webhook auth headers (Bearer tokens etc.) in an unencrypted JSONField; `IntegrationRequestLog` may persist them in logged request headers. Encrypt at rest (e.g., fernet field) and redact headers in logs.
6. **Webhook signature verification is optional** — `RESEND_SIGNING_SECRET` / `RESEND_INBOUND_SECRET` default to `None` (`settings.py:252`), so tracking + inbound email webhooks can be spoofed (fake "delivered" states, injected inbound emails). Make the secrets mandatory in production (fail startup if unset when not DEBUG).
7. **No login rate limiting** — `login_view` (`core/views.py:578`) and `reset-password/confirm` are unthrottled (only the reset *send* has a 60s cooldown). Same throttling work as #3.
8. **No MFA/2FA** — acceptable for launch for a small team, but should be on the near-term roadmap for tenant admins (they can read all customer PII).
9. **Debug `print()` statements in production paths** — `settings.py:88`, `core/views.py:130` etc. Replace with `logging`.
10. **`X-Forwarded-For` trusted blindly** for API-key IP audit (`core/authentication.py:180`) — spoofable unless the proxy strips it; document/pin the proxy config.

### Security — things that are actually in good shape
- Tenant isolation middleware is well designed: authenticated non-superusers are locked to their own tenant; API keys pin the tenant; X-Tenant spoofing is blocked for normal users.
- API keys are hashed (PBKDF2), prefix-indexed, expirable, usage-audited.
- Inbound email HTML is sanitized server-side with `nh3.clean()` before storage, so the frontend `dangerouslySetInnerHTML` in `EmailsTab.jsx`/`EnhancedActivityTimeline.jsx` is currently safe — but fragile. Recommend defense-in-depth: DOMPurify on render too.
- Password validators, secure cookies in prod, CSRF/CORS from env — all fine.

---

## 🔴 Functional — Go-Live Blockers (P0)

1. **No pagination on any list endpoint** (verified: zero `pagination_class`/`PAGE_SIZE` in backend). Work items, tasks, customers, emails, logs — everything returns the full table. This will degrade within weeks of real usage and is an OOM/timeout risk. Add DRF `PageNumberPagination` (default 50) globally + frontend handling.
2. **Celery Beat has no schedule** — `retry_failed_syncs` and `cleanup_old_integration_logs` exist but are never scheduled, so failed webhooks stay failed forever and logs grow unbounded. Define `CELERY_BEAT_SCHEDULE` and run beat in deployment.
3. **Mixed Polish/English UI with no i18n framework** — `LeadBoard.jsx`, `CarMode.jsx`, `SideNav.jsx` ("Wszystkie Leady", "Błąd ładowania leadów") vs. English everywhere else. Decide the launch language, do one consistency pass now; adopt i18next only if multi-language is actually on the roadmap.
4. **Destructive deletes with no undo** — no soft delete anywhere; deleting an Employee cascades to their Tasks, deleting a WorkItem wipes its history. For a system-of-record this is a data-loss trap. Minimum for launch: `is_active`/archive flag on Customer, WorkItem, Employee + confirmation UX; full soft-delete later.

## 🟠 Functional — High

5. **No status-change audit trail** — WorkItem stores only current status; no history of who moved what when. Disputes ("when did we mark it ready?") are unanswerable. A simple `StatusChange` log model (or django-simple-history on WorkItem) covers it.
6. **No customer notifications on status change** — email infra exists but nothing triggers "your repair is ready" automatically. This is the single highest-value quick win: wire status transitions to optional templated emails.
7. **Inventory balances not auto-updated from transactions** — `InventoryBalance` exists but no signal/logic keeps it in sync with `InventoryTransaction`; average cost is never computed. Either wire it up or hide balance figures until it is (showing wrong stock is worse than none).
8. **Near-zero test coverage on core workflows** — `tasks/tests.py`, `service/tests.py`, `inventory/tests.py`, `tenants/tests.py` are 3-line stubs. Email (225 lines) and calls (536 lines) are well tested — apply the same standard to WorkItem lifecycle (status transitions, payment/cash-register side-effects) which contains the most intricate business logic.
9. **No data export** — no CSV/Excel anywhere. Small-business owners will ask for this in week one (accounting handoff at minimum).
10. **Dead code / TODOs in shipped UI** — `WorkItemDetail.jsx` "TODO: Implement new task functionality", `TaskDetail.jsx` `onEdit={() => console.log('Edit device')}` (a visible Edit button that does nothing). Ship it or hide it.

## 🟡 Functional — Medium

- Duplicate customer handling: constraints prevent exact email/phone dupes, but no merge tool and no fuzzy detection (two "Jan Kowalski" with different phones).
- `Opportunity` model is a stub (description only) — hide from UI or cut it for launch.
- `closed_date` not auto-set when a work item reaches a resolved-role status.
- Cross-field validation gaps (e.g., courier intake without tracking info).
- `custom_fields` JSONField accepts anything — validate against the tenant's field definitions.
- Global search is prefix/keyword only; fine for launch, plan Postgres full-text later.
- Accessibility: decent ARIA coverage, but missing alt text on icons/images.

---

## 💡 Product Owner: Improvements to Existing Features

**Work Items (the money flow):**
- Status timestamps + "time in status" — enables the SLA/turnaround reporting every repair shop asks for.
- Due-date alerting: `due_date` exists but nothing happens when it passes. Surface overdue items via the existing "Needs Attention" dashboard card *and* a daily digest email to owners.
- Price-change guardrail: `final_price` can silently diverge from `estimated_price`; add an "approved by customer" checkbox/timestamp — this is a common dispute point in repair businesses.
- Print an intake receipt at drop-off (document generation via Playwright already exists — add an intake template + print button on WorkItem detail).

**Email:**
- Template variables (`{{customer_name}}`, `{{reference_id}}`) in EmailTemplate — templates exist but are static HTML, which sharply limits their usefulness.
- Auto-suggest the customer's email in the composer when opened from a work item (verify this prefills; if not, it's a 1-line win).

**Leads:**
- Capture `converted_at` + source attribution so marketing spend can be evaluated; currently conversion is untracked.

**Onboarding:**
- New tenant setup is scattered across Django admin + settings pages. A first-run checklist (add users → configure statuses → verify email domain → create first work item) would cut support burden significantly.

## 💡 Product Owner: New Feature Suggestions (post-launch roadmap)

**Launch +30 days:**
1. **Customer status page** — public tokenized link (`/track/<token>`) showing repair status. Kills the #1 inbound call driver ("is it ready?"). Cheap: one public endpoint + one page, reuse status roles.
2. **In-app notification center** — bell icon fed by status changes, inbound email replies, overdue items. The events already exist as Django signals.
3. **SMS notifications** (Twilio/local provider) — repair-shop customers respond to SMS far better than email; reuse the notification triggers from #2.

**Launch +60 days:**
4. **Reporting module** — revenue by period, turnaround time, technician utilization, status funnel. Data model already supports all of it.
5. **Bulk operations** — multi-select status change / assignment on work item and task lists.
6. **Audit log UI** — surface the who-changed-what trail (builds on functional gap #5).

**Launch +90 days:**
7. **Barcode/QR on intake receipts** — scan to open the work item; pairs with the printed receipt.
8. **Calendar view** — task due dates + courier pickups.
9. **Technician time tracking** — actual vs. estimated duration already half-exists on Task; add a timer.

---

## Corrections to earlier internal findings (verified against source)
- Email **sending endpoint exists and works** (`SendEmailView`, `core/urls.py:35` + full EmailComposer UI) — an earlier sub-report claiming "no send capability" was wrong.
- PDF generation **exists** (Playwright in `documents/tasks.py`) — the gap is template sanitization and an intake-receipt template, not the engine.
- Frontend `dangerouslySetInnerHTML` is currently mitigated by server-side nh3 sanitization of inbound email.

## Verification (for the fix work that follows this review)
- P0 security fixes verifiable via: unit test asserting `isinstance(settings.SECRET_KEY, str)`; DRF throttle tests hitting quick-login >N times expecting 429; template render test with `<script>` in customer name.
- Pagination: hit `/api/workitems/` and assert `count/next/previous/results` envelope; frontend lists still render.
- Beat schedule: `celery -A app beat` starts and lists the two periodic tasks.
