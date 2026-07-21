# Fixed — Completeness & Architecture Review

**Review date:** 2026-07-13 (branch: `user-management`)
**Scope:** domain model, feature gaps, SaaS readiness, architecture/scalability, frontend/UX.
**Explicitly out of scope:** security (covered separately in [SECURITY_AUDIT_2026-07.md](SECURITY_AUDIT_2026-07.md) and [GO_LIVE_REVIEW.md](GO_LIVE_REVIEW.md)).

This review builds on [GO_LIVE_REVIEW.md](GO_LIVE_REVIEW.md) (2026-07-07) and does **not** repeat its findings (pagination, throttling, Celery Beat scheduling, notifications, soft-delete, status audit trail, CSV export, i18n, dead UI code). Where relevant it references them. Grounded in a direct read of all 9 backend apps' models, tenant middleware/manager, integration signals/tasks, key views, and frontend routes.

---

## TL;DR — the four things to fix before taking money

1. **Tenant isolation is per-view discipline, not structural** — one forgotten `.filter(tenant=...)` anywhere = cross-tenant data leak, and `Opportunity` already has no tenant FK at all.
2. **A new tenant gets a broken app** — default picklist values were seeded by a one-time migration over *then-existing* tenants; there is no provisioning path for tenant #2.
3. **Delete-cascade chains can silently wipe work history** — deleting a Location deletes Employees, which deletes their Tasks.
4. **There is no financial backbone** — no line items, no VAT, no invoice numbering, and card payments are never recorded anywhere. For a Polish/EU SMB market that's a legal problem, not just a feature gap.

---

## 1. Domain Model Critique

### Blockers

**1.1 — Tenant scoping is opt-in and mostly opted out.**
The overview and CLAUDE.md claim `TenantAwareManager` "auto-filters by tenant", but `backend/tenants/managers.py:3-6` only adds an optional `.for_tenant()` helper — the default queryset is unfiltered. Worse, most core models (`WorkItem`, `Task`, `Customer`, `Lead`, `Call`, `EmailMessage`) don't use `TenantModelMixin` at all; they declare their own `tenant` FK and rely on every view remembering to filter. Current views do this correctly (spot-checked), but the failure mode is silent and catastrophic: the next endpoint added under deadline pressure leaks tenant A's customers to tenant B.
*What breaks if ignored:* nothing — until it does, and then it's a churn-every-customer incident.
*Fix (effort M, ~2-3 days):* either (a) a contextvar tenant set by middleware + a manager whose `get_queryset()` filters by it (django-multitenant pattern), or minimally (b) a shared `TenantScopedViewSet` base class all viewsets inherit, plus a CI test that introspects every registered DRF route and asserts tenant scoping. Do (b) now even if (a) is planned.

**1.2 — `Opportunity` is unscoped and a stub.**
`backend/customers/models.py:142-145` has no tenant FK, no status, no value — just a description. Cut it before launch (effort S); resurrect when a sales pipeline is actually built.

**1.3 — Destructive cascade chain.**
`Employee.location` is `CASCADE` (`backend/service/models.py:68`) and `Task.assigned_employee` is `CASCADE` (`backend/tasks/models.py:184`). So: admin deletes an old Location → every Employee stationed there is deleted → every Task those employees were ever assigned (including completed work history on closed RMAs) is deleted. No warning, no undo. Compounds the soft-delete gap the prior review flagged.
*Fix (effort S, hours):* change both to `PROTECT`, add `is_active` to Employee/Location. Trivial migration.

### Important

**1.4 — Reference-ID generation races.**
Both `WorkItem.save` (`backend/tasks/models.py:143-163`) and `Task.save` (`backend/tasks/models.py:194-210`) compute `Max(existing)+1` with no lock. Two simultaneous intakes (front desk + API key) → same `RMA-n` → the unique constraint turns it into a 500 for one clerk. The Max-scan also casts a substring over every row per create.
*Fix (S):* per-tenant counter row updated under `select_for_update()`, or catch `IntegrityError` and retry.

**1.5 — Status logic hardcodes names that tenants can rename.**
`status_role` on `PicklistValue` (`backend/core/models.py:148-168`) exists precisely to avoid this, but `Task.save` (`backend/tasks/models.py:213`) still checks `status == 'Done'` literally. A tenant renames "Done" → `completed_date`/`actual_duration` silently stop being set, and future turnaround reporting is quietly wrong. Same family: `WorkItem.closed_date` is never auto-set at all.
*Fix (S):* resolve completion via `status_role='resolved'` lookup. **Also verify** `allowed_transitions` is enforced server-side — no backend enforcement was found, meaning the API (and any API-key integration) can make illegal transitions the UI prevents.

**1.6 — Shared `Device` points at tenant-scoped `Category`.**
`Device` (`backend/inventory/models.py:43-46`) is deliberately global, but its `category` FK targets the tenant-scoped MPTT `Category`. Whichever tenant categorizes a device first wins; other tenants see a foreign tenant's category (name leak) or an apparently uncategorized device. Pick one: make Device tenant-scoped (simpler, some duplication) or introduce a global device taxonomy. Effort M either way; the longer it waits the more shared rows entangle.

**1.7 — Money model is a dead end.**
`WorkItem` has four scalar price fields and a free-text currency (`backend/tasks/models.py:94-116`). Missing: line items (labor vs. parts — `InventoryTransaction.work_item` exists but costs never roll up to a price), tax/VAT rates, and any record of *card* payments — `CashTransaction` only covers cash registers, so `payment_method='Card'` is a string with no ledger entry behind it. Revenue reporting, reconciliation, and legally required VAT invoicing (sequential numbering!) are all unbuildable on the current shape. Related: `CashRegister.current_balance` (`backend/service/models.py:107-109`) sums `amount` while ignoring `currency` — one EUR transaction in a PLN register corrupts the balance.
*What breaks:* cannot lawfully invoice Polish customers; owners can't answer "how much did we make this month".
*Fix:* biggest modeling investment on the list (L, 1-2 weeks for line items + payment records). For actual VAT invoices, seriously consider integrating Fakturownia/inFakt instead of building — that decision itself is worth an hour.

**1.8 — Inventory balance updates aren't concurrency-safe.**
Receive-delivery does read-modify-write on `InventoryBalance` with `bulk_update` and no `select_for_update` (`backend/inventory/views.py:415-494`); concurrent receipts or a receipt racing a usage deduction lose updates. `backend/inventory/views.py:460` does average-cost math through `float()`, drifting Decimal values. The prior review's finding also stands: nothing decrements balances when parts are *used* on a work item, so stock numbers are already fictional.
*Fix (S-M):* `select_for_update()` on balances, Decimal math, and derive balance mutations from `InventoryTransaction` in one service function instead of view-local logic.

**1.9 — `PurchaseOrder.order_number` is globally unique** (`backend/inventory/models.py:101`) — tenants collide with each other's numbering and get opaque IntegrityErrors. Make it `unique_together(tenant, order_number)` (S).

**1.10 — Missing indexes where access patterns are obvious.**
`WorkItem` and `Task` define no indexes beyond the reference-id constraint. Every list view filters `(tenant, status)` and sorts by `created_date`; overdue queries need `(tenant, due_date)`. FK columns are auto-indexed, but these composites aren't. `Note` and `EmailMessage` GFKs have no `(content_type, object_id)` index — every detail page does that lookup. Cheap wins (S) that matter past ~100k rows.

### Missing entities a repair-shop SaaS normally has

- **Warranty** — `type='Warranty Repair'` exists but no warranty period, terms, or link from a warranty claim back to the original work item. Can't answer "is this repair still under our 90-day warranty?"
- **Quote/Approval** — a `quote` FormTemplate exists but no state machine: quoted amount, sent-at, customer approved/declined, approved-at. The #1 dispute shield in repair businesses.
- **StockTransfer** — `TIN`/`TOUT` transaction types exist but nothing pairs them; a transfer is two unlinked rows with no atomicity and no in-transit state.
- **Appointment/booking** — no scheduling concept anywhere (courier pickups, drop-off slots).
- **Payment** (see 1.7) and **AuditLog** (prior review).

---

## 2. Feature Gap Analysis

Compared against RepairShopr / RepairDesk / Fixably feature baselines.

**Must-have before charging money:**

| Gap | Why | Effort |
|---|---|---|
| Customer notifications on status change | Prior review #6 — every commercial competitor has it; email infra already built | S |
| Quote → approval workflow | Legal/dispute protection; price fields exist, needs state + timestamps + (later) customer-facing approve link | M |
| Invoice with VAT + payment recording | Legally required in the Polish market (see 1.7) | L or integrate |
| Intake receipt printing | Physical proof-of-possession at drop-off; PDF engine exists, needs template + button | S |
| Status history | Prior review #5 | S |
| CSV export | Prior review #9 | S |

**Fine to defer:** warranty tracking, SLA escalation, technician timers (`actual_duration` is a proxy), multi-location transfers, customer portal (though the tokenized status page from the prior review is the cheapest high-value roadmap item), reporting module, barcode/QR.

**Gap competitors have that isn't on either list: device intake checklists** (condition photos, pattern-lock capture, pre-existing damage sign-off). `device_condition` is free text; photo attachments at intake prevent "you scratched my screen" disputes. Medium effort, high dispute-avoidance value — slot it right after notifications.

---

## 3. SaaS Readiness

**3.1 — Billing: absent, and that's fine *if* it's a decision.**
`Tenant` is name + subdomain + timestamp (`backend/tenants/models.py:4-10`). For the first 5-20 tenants, manual invoicing is right — do **not** build Stripe now. But add the minimum enforcement surface today (S): `is_active`, `plan`, `trial_ends_at` on Tenant, plus a middleware check blocking inactive tenants. Without `is_active` there is no way to turn off a non-paying customer except deleting their data.

**3.2 — Tenant onboarding is broken for tenant #2 (BLOCKER).**
Default picklist values were seeded by migration `core/migrations/0015_populate_picklist_values.py` iterating `Tenant.objects.all()` *at migration time*. No `post_save` signal on Tenant, no provisioning command. A tenant created today gets zero statuses — work item creation and every status dropdown break. Roles need two separate manual management commands (`create_tenant_admin_role`, `create_ai_agent_role`); no default RepairShop/Location either (and `Employee.location` is required, so the first employee can't even be created).
*Fix (M, ~2 days):* one `provision_tenant` service (callable from a command and admin) that creates: tenant → default picklists (extract migration data into a shared fixture) → admin role + user → default shop + location + cash register → email settings row. **Single highest-leverage item for actually selling the product.**

**3.3 — GDPR/data lifecycle.**
Selling to EU businesses holding consumer PII, with no customer anonymization path — `WorkItem.customer` is `PROTECT`, so a deletion request can't be honored without destroying repair history. Correct pattern: an `anonymize()` that scrubs name/email/phone/address in place. No tenant offboarding export either. Not a launch blocker, but have the anonymize function (S) before the first deletion request arrives — improvising under a 30-day GDPR clock is miserable.

**3.4 — Audit logging** — covered by prior review (#5 + roadmap). Addition: when built, include *who* — including API-key attribution (`APIKey.user` exists for exactly this).

**3.5 — APIKey abuse protection.**
Global throttling is already P0 in the prior review; API-key-specific additions: per-key rate limits (a `rate_limit` field checked in authentication, cache-counter backed — S) and alerting on failed-auth bursts. `update_usage()`'s racy counter (`backend/core/models.py:416-434`) is cosmetic; ignore.

---

## 4. Architecture & Scalability

**4.1 — Webhook echo loops (verify before launch).**
`workitem_updated` fires on *every* save (`backend/integrations/signals/workitem.py:70-76`). The AI-summary flow means n8n POSTs a result back → work item saved → `workitem_updated` fires again → another webhook. Any tenant subscribing to `workitem_updated` alongside the summary integration gets an echo per summary; a naive n8n workflow that writes back creates an infinite loop, throttled only by Celery latency.
*Fix (S):* skip the signal when `update_fields` is only summary/bookkeeping fields; consider a per-object debounce.

**4.2 — No circuit breaker on integrations.**
A tenant's dead webhook endpoint costs 4 HTTP attempts (with 60s+ backoff waits) per event, on every save, forever — Celery workers spend their time waiting on timeouts for a URL that's been 404 for a month. At 50 tenants this is the queue's biggest tail risk.
*Fix (M):* auto-disable (or quarantine) an integration after N consecutive failures + surface in UI; separate Celery queues so webhooks can't delay customer emails and PDF generation (`-Q webhooks,email,documents`).

**4.3 — `IntegrationSync` grows without bound by design** (one row per update event, deliberately no uniqueness — `backend/integrations/models.py:157-158`), and the cleanup task only covers `IntegrationRequestLog`. Add retention for syncs too (S). Fine for a year, painful after.

**4.4 — Session-auth across subdomains is unproven for prod.**
`SESSION_COOKIE_DOMAIN` is commented out (`backend/app/settings.py:218`). If production runs `tenant.yourdomain.com` per tenant, session and CSRF cookies won't cross subdomains as configured; if instead one app domain + `X-Tenant` header, then subdomain tenancy is dead code. Decide the production topology now — it affects CORS, cookies, and the middleware — not during deployment week (decision: hours; config: S).

**4.5 — Middleware logs 4 `WARNING` lines per request** including headers and user (`backend/tenants/middleware.py:43+`). In production that's log flooding that buries real warnings. Drop to `debug` (trivial).

**4.6 — Postgres connections:** no `CONN_MAX_AGE`, no pooling. Non-issue until roughly >30 req/s; note and move on.

**Architecturally sound, keep as-is:** `transaction.on_commit` before enqueueing webhooks; the immutable `InventoryTransaction` ledger design; `PicklistValue` (constraints, indexes, `status_role`, `usage_count` — genuinely well done; the misuse is in *consumers* hardcoding names, per 1.5); the tenant middleware's resolution-order logic.

---

## 5. Frontend / UX Gaps

**5.1 — There is no customer list.**
Routes have `/customers/:id` only (`frontend/src/App.jsx:54`) — customers are reachable solely via global search. A manager cannot browse customers, find repeat customers, or do any list-level work. For a system whose second-most-important entity is Customer, this is conspicuous. Important, effort S-M (list + filters, reusing work-item list patterns).

**5.2 — No task-completion friction for the money moment.**
Related to 1.5/quotes: when a work item hits a resolved status there's no forced "resolve payment" step tying `final_price` to a `CashTransaction`/payment record. A `ResolvePaymentModal` component exists — **verify** it's mandatory in the flow, not optional.

**5.3 — Kiosk story is half-built, and it's a differentiator.**
LockScreen + PIN quick-login + CarMode is a genuinely good shared-workstation/driver setup that competitors handle badly. Missing to complete it: idle-timeout auto-lock (a shared bench iPad left unlocked defeats the PIN), and "who am I" visibility in the header so techs notice they're acting as the wrong user. Small effort; hardens the same surface the security review flagged (PIN brute force).

**5.4 — Already covered by prior review, still true:** no bulk actions, no notifications UI, no KPI dashboard beyond "Needs Attention", dead Edit buttons. Addition: with no pagination *and* no list virtualization, `AllTasks` will be the first page to visibly die — fix pagination backend-first as planned.

---

## Priority order (recommended sequence)

1. **Tenant provisioning service** (3.2) — can't onboard customer #2 without it. *M*
2. **Cascade fixes → PROTECT + is_active flags** (1.3) — one admin click from data loss. *S*
3. **Structural tenant scoping + route-coverage test** (1.1) — before the codebase grows further. *M*
4. **Tenant.is_active + plan fields** (3.1) — enforcement surface for manual billing. *S*
5. **Status-role lookups replacing hardcoded names + server-side transition enforcement + closed_date** (1.5). *S*
6. **Reference-ID locking, PO number scoping, inventory select_for_update, indexes** (1.4, 1.9, 1.8, 1.10) — one "concurrency & constraints" day. *S each*
7. **Notifications on status change** (2) — highest-value customer-visible feature; infra exists. *S*
8. **Quote/approval state + intake receipt printing** (2) — dispute protection. *M*
9. **Webhook echo guard + circuit breaker + queue split** (4.1, 4.2). *M*
10. **Payments/line-items/VAT decision** (1.7) — one hour deciding build-vs-integrate for invoicing, then schedule the L-sized work; everything financial downstream depends on it.

Items 1-6 ≈ two focused weeks and remove every "silently loses or leaks data" failure mode; 7-8 make the product sellable; 9-10 make it durable.

## Open verifications

Three findings were flagged as "verify" (models/signals read directly, but not every view path traced):
- 1.5 — is `allowed_transitions` enforced anywhere server-side?
- 4.1 — does the summary write-back actually re-trigger `workitem_updated` (echo loop)?
- 5.2 — is `ResolvePaymentModal` mandatory when resolving a paid work item?
