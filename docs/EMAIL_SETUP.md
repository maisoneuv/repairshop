# Email Setup & Usage

This document covers the full email system: system emails, tenant→customer emails with reliable async delivery, customer reply threading, delivery tracking, and the optional per-tenant custom sending domain.

---

## Architecture Overview

There are two independent email flows:

| Flow | From address | Replies |
|---|---|---|
| **System emails** (password reset, invitations) | Global `DEFAULT_FROM_EMAIL` (e.g. `no-reply@yourdomain.com`) — same for every tenant | Not captured (no-reply) |
| **Tenant → customer emails** (composer on work items) | Hybrid, per tenant (see below) | Captured into the work-item thread **and** forwarded to the tenant's inbox |

### Hybrid From strategy for tenant emails

1. **Default (zero setup, always deliverable):** `"Tenant Name" <tenant-slug@PLATFORM_EMAIL_DOMAIN>` — the platform-owned sending domain. Tenants can change the display name and the slug in **System Settings → Email**.
2. **Optional white-label upgrade:** the tenant verifies their own domain (SPF/DKIM DNS records via the Resend Domains API) in the settings wizard. Once verified, they can send as e.g. `andrzej@repairhero.com`. Until the domain is verified, the default platform address is used — an unverified domain in the `From:` header would be rejected by the ESP or land in spam.

### Reliability

- Sends are **asynchronous**: `POST /api/core/emails/send/` persists the email + attachments, returns immediately with status `queued`, and a Celery task delivers it with automatic retries (exponential backoff, `EMAIL_SEND_MAX_RETRIES`, default 5).
- **Delivery tracking**: Resend webhooks update status — `queued → sending → sent → delivered` (or `bounced` / `complained` / `failed` with the error shown in the Emails tab).

### Reply threading

Every outbound customer email sets `Reply-To: reply+<token>@PLATFORM_REPLY_DOMAIN`. When the customer replies:

1. Resend receives the reply (inbound MX) and posts it to our inbound webhook.
2. The token matches the reply to the original message → an inbound `EmailMessage` appears in the same work-item Emails tab (HTML sanitized, attachments stored).
3. A copy is forwarded to the tenant's **Forward replies to** address, with `Reply-To` set to the customer — staff can answer straight from their inbox.

---

## One-time Platform Setup (production)

### 1. Resend account & sending domain

1. Sign up at [resend.com](https://resend.com) and create an API key.
2. **Domains → Add domain**: `mail.yourdomain.com` (the platform sending domain). Add the SPF/DKIM DNS records Resend shows you and wait for **Verified**.
3. **Domains → Add domain**: `reply.yourdomain.com` and enable **inbound** — this requires an **MX record** pointing to Resend. This is where customer replies arrive.

### 2. Webhooks

In the Resend dashboard (**Webhooks**), create two endpoints:

| Purpose | URL | Events | Secret env var |
|---|---|---|---|
| Delivery tracking | `https://api.yourdomain.com/api/webhooks/anymail/resend/tracking/` | `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed` | `RESEND_SIGNING_SECRET` |
| Inbound replies | `https://api.yourdomain.com/api/webhooks/anymail/resend/inbound/` | `email.received` | `RESEND_INBOUND_SECRET` |

Copy each endpoint's svix signing secret (`whsec_…`) into the matching env var. The webhook views verify signatures; with the secrets unset (dev), unsigned posts are accepted.

### 3. Environment variables

```env
EMAIL_BACKEND=anymail.backends.resend.EmailBackend
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_SIGNING_SECRET=whsec_...   # tracking webhook
RESEND_INBOUND_SECRET=whsec_...   # inbound webhook

DEFAULT_FROM_EMAIL=no-reply@yourdomain.com   # system emails
PLATFORM_EMAIL_DOMAIN=mail.yourdomain.com    # tenant default From domain
PLATFORM_REPLY_DOMAIN=reply.yourdomain.com   # reply-to / inbound domain
EMAIL_SEND_MAX_RETRIES=5
```

Celery worker + Redis must be running (they already are in the Docker deployment; the worker shares the media volume so it can read attachments).

---

## Per-tenant Setup (System Settings → Email)

Works out of the box — nothing is required to start sending:

- **Display name** — sender name shown in customers' inboxes.
- **Default sending address** — editable local part of `<slug>@mail.yourdomain.com` (defaults to the tenant subdomain).
- **Forward replies to** — the tenant's real inbox; customer replies are captured in the app and forwarded here. *Recommended to set this.*

### Optional: custom sending domain (white-label)

1. **Connect domain** — enter e.g. `repairhero.com`. The app registers it with Resend and shows the DNS records to add (with copy buttons and per-record status).
2. Add the records at the domain registrar, then **Check verification** (the panel also auto-refreshes while pending). DNS can take up to an hour to propagate.
3. Once **Verified**, set the **From email address** (must be on the verified domain) and save. All customer emails now send from that address. Replies still thread through `reply.yourdomain.com` — no MX changes needed on the tenant's domain.
4. **Remove domain** reverts to the default platform address.

API endpoints (require `manage_users` permission):

```
GET/PATCH /api/core/email-settings/                # from_name, sending_slug, reply_forward_email, from_email
POST      /api/core/email-settings/domain/         # {domain} — register + get DNS records
GET       /api/core/email-settings/domain/         # refresh status from Resend
POST      /api/core/email-settings/domain/verify/  # trigger a DNS verification check
DELETE    /api/core/email-settings/domain/         # remove domain, revert to default
```

---

## Sending Emails

### API

```
POST /api/core/emails/send/
Content-Type: multipart/form-data
```

| Field | Required | Description |
|---|---|---|
| `to_email` | yes | Recipient address |
| `subject` | yes | Email subject |
| `body_html` | yes | HTML body |
| `body_text` | no | Plain-text fallback (auto-stripped from HTML if omitted) |
| `model` | yes | Django model name, e.g. `workitem` |
| `object_id` | yes | ID of the related object (links email to work item) |
| `cc_emails` | no | List of CC addresses |
| `attachments` | no | Uploaded file(s) |
| `document_ids` | no | List of `FormDocument` IDs to attach as PDFs |

Returns HTTP 201 immediately with the created `EmailMessage` in status `queued`; delivery happens on the Celery worker. Failures surface later as `failed`/`bounced` status on the record (visible in the Emails tab).

### Retrieving Emails

```
GET /api/core/emails/<model>/<object_id>/
```

Returns all emails (outbound **and** inbound replies) linked to the given model instance, newest first. Inbound replies carry `direction: "inbound"` and `in_reply_to: <parent id>`.

---

## Email Templates

Templates are tenant-scoped, reusable HTML snippets with a subject line.

```
GET    /api/core/email-templates/        # list
POST   /api/core/email-templates/        # create
GET    /api/core/email-templates/<id>/   # retrieve
PUT    /api/core/email-templates/<id>/   # update
DELETE /api/core/email-templates/<id>/   # delete
```

| Field | Description |
|---|---|
| `name` | Unique per tenant |
| `subject` | Default subject when template is loaded |
| `body_html` | HTML body |

Templates are loaded in the email composer UI when composing from a work item.

---

## Data Model

| Model | Description |
|---|---|
| `EmailMessage` | One row per outbound **or** inbound email. `direction`, `status` (`queued/sending/sent/delivered/bounced/complained/failed/received`), `reply_token` (routes replies), `provider_message_id` (matches tracking events), `in_reply_to` (threading). Linked to any model via generic FK. |
| `EmailAttachment` | Files on an email (outbound uploads, work-item PDFs, inbound attachments). Stored in `email_attachments/YYYY/MM/`. |
| `EmailTemplate` | Reusable per-tenant template. Unique on `(tenant, name)`. |
| `TenantEmailSettings` | Per-tenant sender identity: `from_name`, `sending_slug`, `reply_forward_email`, and custom-domain state (`custom_domain`, `resend_domain_id`, `domain_status`, `dns_records`). |

---

## Development

Default dev config prints emails to the terminal:

```env
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

Run a Celery worker so queued emails actually "send":

```bash
cd backend && celery -A app worker --loglevel=info
```

### Testing webhooks locally

1. `ngrok http 8000`, then register `https://<ngrok>/api/webhooks/anymail/resend/tracking/` and `.../inbound/` in the Resend dashboard.
2. Use Resend's test recipients to exercise status transitions without emailing real people: `delivered@resend.dev`, `bounced@resend.dev`.
3. For inbound: send a real email to `reply+<token>@reply.yourdomain.com` (the token is on the outbound `EmailMessage` row).

### Unit tests

```bash
cd backend && python manage.py test core.tests.test_email
```

Covers sender resolution (hybrid strategy), the send task (success/idempotency/failure), tracking events (incl. out-of-order), inbound parsing (token match, dedup, loop guard, HTML sanitation), and reply forwarding.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Email stuck in **Queued** | Celery worker running? `redis-cli ping`? Worker logs show retries + error message. |
| **Failed** with provider error | `error_message` on the email card; `RESEND_API_KEY` valid; platform domain verified in Resend. |
| Status never reaches **Delivered** | Tracking webhook registered and `RESEND_SIGNING_SECRET` correct (401s in Resend's webhook logs mean a bad secret). |
| Replies not appearing in the app | Inbound domain (MX) verified; inbound webhook registered with `RESEND_INBOUND_SECRET`; the customer replied to the `reply+<token>@…` address. |
| Reply captured but not forwarded | Tenant's **Forward replies to** field set? Worker logs for `forward_inbound_email`. |
