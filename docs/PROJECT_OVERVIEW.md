# Project Overview — Fixed Service

A multi-tenant service management application for repair shops. Built with Django REST Framework (backend) + React/Vite (frontend).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 4.x + Django REST Framework |
| Frontend | React 18, React Router v7, Chakra UI, Tailwind CSS, Axios |
| Database | PostgreSQL |
| Task Queue | Celery + Redis |
| Auth (frontend) | Session-based (cookies) |
| Auth (external) | API Keys (`Authorization: Bearer <key>`) |

**Ports (local dev)**
- Backend: `localhost:8000`
- Frontend: `localhost:5173`
- Multi-tenant: subdomains like `repairhero.localhost:5173`

---

## Multi-Tenancy

Every data-bearing model is scoped to a **Tenant**. This is the foundational isolation mechanism.

- `Tenant` — top-level org (identified by unique `subdomain`)
- `TenantModelMixin` — abstract base that adds a `tenant` FK + `TenantAwareManager` (auto-filters queryset by tenant)
- Tenant is resolved per-request by `TenantMiddleware` using, in order:
  1. Authenticated user's tenant
  2. `X-Tenant` HTTP header
  3. Subdomain (e.g. `repairhero.localhost`)

All models listed below are tenant-scoped unless noted otherwise.

---

## Domain Model Summary

The application is organised into 8 Django apps:

```
tenants/     — Tenant & TenantModelMixin
core/        — User, Role, Permissions, Notes, Settings, APIKeys, PicklistValues
customers/   — Customer, Asset, Lead, Opportunity
inventory/   — Device, Category, InventoryItem, InventoryList, InventoryBalance,
               InventoryTransaction, PurchaseOrder, PurchaseOrderItem, Supplier
service/     — RepairShop, Location, Employee, CashRegister, CashTransaction
tasks/       — WorkItem, Task, TaskType, TaskTypeValidationRule
integrations/— TenantIntegration, IntegrationSync, IntegrationRequestLog, CustomAction
documents/   — FormTemplate, FormDocument
```

---

## Entity Relationship Diagram

```
┌──────────────┐
│   Tenant     │
│──────────────│
│ name         │
│ subdomain    │
└──────┬───────┘
       │ (FK on nearly every model below)
       │
       ├────────────────────────────────────────────────┐
       │                                                │
┌──────▼───────┐                               ┌───────▼──────┐
│    User      │                               │   Setting    │
│──────────────│                               │──────────────│
│ email (PK)   │                               │ key          │
│ name         │                               │ value_type   │
│ phone_number │                               │ value_string │
│ pin_hash     │                               │ value_numeric│
│ tenant FK    │                               │ value_boolean│
│ created_by FK│                               │ value_date   │
└──────┬───────┘                               └──────────────┘
       │
       ├─────────────────────┐
       │                     │
┌──────▼───────┐     ┌───────▼──────┐
│   UserRole   │     │   Employee   │
│──────────────│     │──────────────│
│ user FK      │     │ user FK (1:1)│
│ role FK      │     │ role (text)  │
└──────────────┘     │ location FK  │
                     │ tenant FK    │
┌─────────────┐      └──────┬───────┘
│    Role     │             │
│─────────────│      assigned to WorkItems & Tasks
│ name        │
│ tenant FK   │
└──────┬──────┘
       │
┌──────▼──────────┐
│ RolePermission  │
│─────────────────│
│ role FK         │
│ permission FK   │
│  (Django auth)  │
└─────────────────┘

┌──────────────┐      ┌──────────────────┐
│   Customer   │      │     Address      │
│──────────────│      │──────────────────│
│ first_name   │      │ street           │
│ last_name    │      │ building_number  │
│ email        │      │ city             │
│ phone_number │      │ postal_code      │
│ prefix       │      │ country          │
│ tax_code     │      └──────────────────┘
│ referral_src │              ▲
│ address FK──►│──────────────┘ (1:1)
│ tenant FK    │
└──────┬───────┘
       │
       ├──────────────────────────────┐
       │                              │
┌──────▼──────┐               ┌──────▼──────┐
│    Asset    │               │ Opportunity │
│─────────────│               │─────────────│
│ customer FK │               │ lead FK     │
│ device FK   │               │ customer FK │
│ serial_num  │               │ description │
└─────────────┘               └─────────────┘
       ▲
       │ device FK
┌──────┴──────┐
│   Device    │  (not tenant-scoped — shared across tenants)
│─────────────│
│ model       │
│ manufacturer│
│ category FK │
└─────────────┘
       ▲
       │ parent FK (MPTT tree)
┌──────┴──────┐
│  Category   │  (TenantModelMixin + django-mptt hierarchy)
│─────────────│
│ name        │
│ parent FK   │
│ tenant FK   │
└─────────────┘

┌──────────────┐      ┌───────────────────┐
│  RepairShop  │      │     Location      │
│──────────────│      │───────────────────│
│ name         │      │ name              │
│ type         │      │ type (shop /      │
│  (internal / │      │  customer /       │
│   partner)   │      │  freeform)        │
│ address FK   │      │ shop FK (opt)     │
│ tenant FK    │      │ customer FK (opt) │
└──────┬───────┘      │ address FK (opt)  │
       │              │ tenant FK         │
       │              └──────┬────────────┘
       │                     │
┌──────▼──────┐     used as dropoff/pickup
│CashRegister │     points on WorkItem
│─────────────│
│ shop FK     │
│ name        │
│ opening_bal │
│ tenant FK   │
└──────┬──────┘
       │
┌──────▼──────────┐
│ CashTransaction │
│─────────────────│
│ register FK     │
│ transaction_type│
│ amount          │
│ currency        │
│ work_item FK    │ (optional, links payment to WorkItem)
│ performed_by FK │ (Employee)
│ tenant FK       │
└─────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          WorkItem                               │
│─────────────────────────────────────────────────────────────────│
│ reference_id  (auto: RMA-1, RMA-2, …  unique per tenant)        │
│ status        (PicklistValue — customisable per tenant)         │
│ type          (Chargeable Repair / Warranty Repair)             │
│ priority      (Standard / Express)                              │
│ description   (problem description)                             │
│ device_condition, accessories, comments                         │
│ intake_method / dropoff_method  (walk_in / courier / driver)    │
│ estimated_price, final_price, repair_cost, prepaid_amount       │
│ payment_method, currency                                        │
│ due_date, created_date, closed_date                             │
│ summary, summary_status  (AI-generated repair summary)          │
│ customer FK ──────────────────────────────► Customer            │
│ customer_asset FK (opt) ───────────────────► Asset              │
│ owner FK ──────────────────────────────────► Employee           │
│ technician FK (opt) ───────────────────────► Employee           │
│ dropoff_point FK ──────────────────────────► Location           │
│ pickup_point FK (opt) ─────────────────────► Location           │
│ fulfillment_shop FK (opt) ─────────────────► RepairShop         │
│ payment_register FK (opt) ─────────────────► CashRegister       │
│ tenant FK                                                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
              ┌────────┴────────┐
              │                 │
       ┌──────▼──────┐   ┌──────▼──────────┐
       │    Task     │   │ PurchaseOrder   │
       │─────────────│   │─────────────────│
       │ reference_id│   │ order_number    │
       │  (T-1, T-2) │   │ status (draft/  │
       │ status      │   │  open/cancelled/│
       │ description │   │  completed)     │
       │ summary     │   │ supplier FK     │
       │ task_type FK│   │ origin_work_    │
       │ assigned_   │   │  item FK        │
       │  employee FK│   │ tenant FK       │
       │ due_date    │   └──────┬──────────┘
       │ completed_  │          │
       │  date       │   ┌──────▼──────────────┐
       │ actual_dura-│   │  PurchaseOrderItem  │
       │  tion       │   │─────────────────────│
       │ work_item FK│   │ purchase_order FK   │
       │ tenant FK   │   │ inventory_item FK   │
       └──────────────   │ quantity            │
                         │ unit_cost           │
                         └─────────────────────┘

┌──────────────┐       ┌───────────────────┐
│ InventoryList│       │  InventoryItem    │
│──────────────│       │───────────────────│
│ name         │       │ name              │
│ location FK  │       │ sku               │
│  (1:1)       │       │ type (PART /      │
│ tenant FK    │       │  CONSUMABLE /     │
└──────┬───────┘       │  ACCESSORY)       │
       │               │ quantity_unit     │
       │               │ category FK       │
       │               │ tenant FK         │
       │               └─────────┬─────────┘
       │                         │
┌──────▼─────────────────────────▼────┐
│         InventoryBalance             │
│──────────────────────────────────────│
│ inventory_list FK                    │
│ inventory_item FK                    │
│ current_quantity                     │
│ average_cost                         │
│ rack, shelf_slot  (physical location)│
│ tenant FK                            │
│ UNIQUE(inventory_list, inventory_item)│
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│       InventoryTransaction            │
│──────────────────────────────────────│
│ inventory_item FK                    │
│ inventory_list FK                    │
│ transaction_type                     │
│  (PUR/SAL/ADJ/RET/TIN/TOUT/USE)      │
│ quantity  (+incoming / -outgoing)    │
│ unit_cost                            │
│ purchase_order FK (opt)              │
│ work_item FK (opt)                   │
│ tenant FK                            │
└──────────────────────────────────────┘

┌─────────────────────────────────┐
│        TenantIntegration        │
│─────────────────────────────────│
│ name                            │
│ integration_type (n8n/notion/   │
│  slack)                         │
│ event_type (workitem_created,   │
│  workitem_updated,              │
│  task_created, …)               │
│ webhook_url                     │
│ headers (JSON)                  │
│ is_active                       │
│ tenant FK                       │
└──────────┬──────────────────────┘
           │
    ┌──────▼──────────────────┐
    │     IntegrationSync     │
    │─────────────────────────│
    │ integration FK          │
    │ content_type FK (GFK)   │  ← generic: points to any model
    │ object_id               │
    │ status (pending/synced/ │
    │  failed)                │
    │ event_type              │
    │ retry_count             │
    │ request_payload (JSON)  │
    │ response_data (JSON)    │
    │ external_id             │
    └─────────────────────────┘

┌──────────────────────────────────┐
│     IntegrationRequestLog        │
│──────────────────────────────────│
│ direction (inbound/outbound)     │
│ method, url                      │
│ request_headers, request_body    │
│ response_status_code             │
│ response_headers, response_body  │
│ success                          │
│ integration FK (opt)             │
│ integration_sync FK (opt)        │
│ api_key FK (opt)                 │
│ client_ip, user_agent            │
│ tenant FK                        │
└──────────────────────────────────┘

┌──────────────┐
│    APIKey    │
│──────────────│
│ name         │
│ prefix       │  (first 12 chars for display)
│ key_hash     │  (bcrypt — plaintext never stored)
│ role FK      │  (permissions come from role)
│ user FK (opt)│  (for action attribution only)
│ integration FK│ (opt — link to outbound integration)
│ is_active    │
│ expires_at   │
│ last_used_at │
│ usage_count  │
│ tenant FK    │
└──────────────┘

┌──────────────────┐
│  PicklistValue   │
│──────────────────│
│ category         │  e.g. 'workitem_status', 'task_status'
│ name             │  display label
│ value            │  stored value
│ color            │  badge color
│ sort_order       │
│ is_active        │
│ is_system        │  protected from deletion
│ tenant FK        │
└──────────────────┘

┌──────────────────┐    ┌────────────────────┐
│  FormTemplate    │    │   FormDocument     │
│──────────────────│    │────────────────────│
│ form_type        │    │ form_type          │
│  (intake/invoice/│    │ template FK        │
│   quote/receipt/ │    │ work_item FK       │
│   work_order/    │    │ file_path          │
│   warranty)      │    │ status             │
│ name             │    │  (pending/success/ │
│ html_content     │    │   error)           │
│ is_active        │    │ generated_by FK    │
│ created_by FK    │    │ tenant FK          │
│ tenant FK        │    └────────────────────┘
└──────────────────┘

┌──────────────────┐
│      Note        │  (generic — attaches to ANY model)
│──────────────────│
│ author FK        │
│ content          │
│ content_type FK  │  Django ContentType (GFK)
│ object_id        │
└──────────────────┘
```

---

## Key Concepts

### 1. Tenant Isolation
Every record belongs to a tenant. `TenantModelMixin` injects the FK and a manager that transparently scopes all querysets. Superusers bypass this. The middleware resolves the active tenant on every request.

### 2. WorkItem (core business object)
The central entity. A **WorkItem** represents a device brought in for repair. It has:
- An auto-generated human-readable ID: `RMA-<n>` (unique per tenant, sequential)
- A **Customer** and optionally a specific **Asset** (the customer's device)
- An **owner** Employee and optional **technician**
- Drop-off and pick-up **Locations**
- Pricing fields: estimated, final, repair cost, prepaid amount
- **Status** driven by tenant-configurable `PicklistValue` entries
- Child **Tasks**, **Notes**, **PurchaseOrders**, **FormDocuments**, **CashTransactions**

### 3. Task
Sub-work within a WorkItem. Auto-ID `T-<n>`. Has a `TaskType` (tenant-defined, e.g. "Diagnosis", "Repair") with optional `TaskTypeValidationRule` — required fields that must be filled before marking the task "Done". Tracks `actual_duration` automatically when completed.

### 4. Inventory System
- **Device** — make/model catalog (shared, not tenant-scoped)
- **Category** — MPTT (tree) hierarchy of device categories (tenant-scoped)
- **InventoryItem** — SKU-level catalog entries (parts, consumables, accessories)
- **InventoryList** — a named store tied 1:1 to a **Location**
- **InventoryBalance** — current stock level per item per list (with rack/shelf)
- **InventoryTransaction** — immutable ledger of all stock movements (linked to WorkItem or PurchaseOrder)
- **PurchaseOrder** — restock orders, can originate from a WorkItem

### 5. Location & RepairShop
**Location** is polymorphic — it can represent:
- A **RepairShop** (internal or partner)
- A **Customer's address**
- A freeform address

WorkItems reference a drop-off and optional pick-up Location. Employees are assigned to a Location.

### 6. Cash Management
**CashRegister** belongs to a **RepairShop**. **CashTransaction** records deposits/withdrawals/transfers, optionally linked to a WorkItem for payment tracking. Balance is calculated by summing all transactions against the opening balance.

### 7. Permissions & Roles
- `Role` — named set of permissions, per tenant
- `RolePermission` — maps a Role to Django `Permission` objects
- `UserRole` — assigns a Role to a User (many-to-many through table)
- `User.has_permission(codename, tenant)` checks via UserRole chain
- `APIKey.has_permission(codename)` checks via the key's assigned Role

### 8. API Keys (external access)
Stripe-style keys: `sk_live_<32hex>`. Only the `key_hash` (bcrypt) is stored. Each key carries a `Role` that defines its permissions. Used for machine-to-machine calls (e.g. from n8n). Separate from session-based human auth.

### 9. Integration System
Event-driven outbound webhooks:
1. A Django signal fires when a WorkItem or Task changes
2. Signal handler looks up active `TenantIntegration` records matching the event type
3. A Celery task POSTs JSON to the configured `webhook_url`
4. Result is recorded in `IntegrationSync` (with retry logic, max 3 attempts)
5. All HTTP traffic (inbound and outbound) is logged in `IntegrationRequestLog`

`CustomAction` — admin-configured webhook buttons shown on WorkItem/Task detail pages in the UI. Clicking sends full record data to a webhook URL.

### 10. Documents
`FormTemplate` — tenant-owned HTML templates with `{{variable}}` placeholders for each form type (intake, invoice, quote, receipt, work order, warranty). Only one template per type can be `is_active`. `FormDocument` tracks every generated PDF per WorkItem.

### 11. PicklistValue
Tenant-configurable dropdown options (e.g. custom status names with colours). The app reads these instead of hardcoded choices. `is_system=True` entries are protected. Covers at minimum `workitem_status` and `task_status` categories.

### 12. Settings
`Setting` supports global defaults (`tenant=null`) and tenant-specific overrides. Typed values (string, numeric, boolean, date) stored in separate columns. `Setting.get_value(key, tenant)` resolves with tenant override > global fallback.

---

## Authentication Flows

```
Browser / SPA              Backend (Django)
──────────────             ────────────────
POST /api/login/     ──►   Session cookie set
Subsequent requests  ──►   Session middleware validates

External System            Backend (Django)
───────────────            ────────────────
Authorization: Bearer sk_live_xxx ──► APIKey looked up by prefix+hash
                                  ──► Role permissions checked
```

Quick-login: users with a PIN can authenticate via `/api/quick-login/` using just their PIN hash (for kiosk/POS scenarios).

---

## Frontend Structure

```
frontend/src/
  pages/
    LoginPage.jsx        — standard email/password login
    LoginForm.jsx        — quick PIN login (lock-screen style)
    Home.jsx             — dashboard
    WorkItemPage.jsx     — list of work items
    WorkItemDetail.jsx   — single work item with tasks, notes, docs
    CustomerDetail.jsx   — customer profile with assets & history
    AllTasks.jsx         — all tasks across work items
    MyTasks.jsx          — current user's assigned tasks
    SearchResults.jsx    — global search
    ProfilePage.jsx      — user profile management
    SettingsPage.jsx     — tenant settings
  context/
    UserContext.jsx      — global auth state (current user, tenant)
  components/
    UserProfileDropdown.jsx
    LockScreen.jsx       — PIN entry overlay
```

React Router v7 handles routing. Chakra UI provides component library. Tailwind CSS for utility styles. Axios for all API calls with session cookie credentials.

---

## API URL Structure

All API routes are mounted under `/api/`:

| Prefix | App |
|--------|-----|
| `/api/` (core) | users, roles, permissions, settings, picklist, search, login |
| `/api/customers/` | customers, assets, leads |
| `/api/service/` | shops, locations, employees, cash registers |
| `/api/tasks/` | work items, tasks, task types |
| `/api/inventory/` | items, lists, balances, transactions, purchase orders |
| `/api/integrations/` | integration configs, syncs, logs, custom actions |
| `/api/documents/` | form templates, generated documents |
| `/admin/` | Django admin (full data management) |

---

## Development Setup (quick reference)

```bash
# Backend
cd backend && python manage.py runserver localhost:8000

# Frontend
cd frontend && npm run dev        # port 5173

# Background workers (needed for integrations)
cd backend && celery -A app worker --loglevel=info
cd backend && celery -A app beat --loglevel=info

# Database
cd backend && python manage.py migrate

# Generate API key for external system
cd backend && python manage.py generate_api_key \
  --tenant=<subdomain> --role=<role_id> --name="Integration Name"
```

---

## Deployment

- Docker: backend code baked into image (rebuild required for code changes)
- Docker service name: `web` — auto-runs `migrate` + `collectstatic` on startup
- Rebuild command: `docker compose build web && docker compose up -d web`
- Container working directory: `/app`
