# Photo Attachments for Tasks & Work Items — Architecture Proposal

## Context

Technicians and CS staff need to attach photos to `WorkItem`s and `Task`s — primarily intake condition photos ("scratches, cracks on arrival") and repair-progress/completion photos. `docs/COMPLETENESS_ARCHITECTURE_REVIEW.md` already flags this as the top competitive gap: `device_condition` is free text today, and photo evidence at intake is what prevents "you scratched my screen" disputes. `docs/WORK_ITEM_DETAIL_UX_BRIEF.md` already mocks a Documents tab holding "intake photos, signed forms, invoices" and a device card showing an intake photo — the UI vocabulary for this feature already exists, it just isn't built.

The complicating factor: staff work mostly on desktop, but photos are taken on a phone. There's no existing photo-upload, QR, or mobile-capture infrastructure anywhere in the codebase — this proposal designs both the storage/data layer and a phone→desktop delivery mechanism from scratch, reusing existing patterns wherever they fit.

**Decisions locked in with the user before this design:**
- Upload access: **staff only** (no customer-facing upload in this phase).
- Photos attach to **WorkItem, Task, and Asset** (device) — not just WorkItem/Task — so a device's reference photo can persist across repeat visits, matching the UX brief's "device card" concept.
- Mobile delivery MVP: **QR code → tokenized mobile web page**. Email-in (reusing the existing inbound-email pipeline) is noted as a natural fast-follow for off-site courier/driver intake, where there's no shop screen to scan a QR from, but is not part of this build.
- Storage: **local Docker volume for now**, with a documented migration path to S3-compatible object storage later.

## Data Model

New `Photo` model in `backend/core/models.py`, placed near `Note` and `EmailAttachment` since it borrows from both:

```python
class Photo(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='photos')

    # Generic relation — same shape as Note (core/models.py:115-130) and
    # EmailMessage, so it attaches uniformly to WorkItem, Task, or Asset.
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")

    image = models.ImageField(upload_to=photo_upload_path)   # see storage section
    thumbnail = models.ImageField(upload_to=photo_thumb_path, null=True, blank=True)
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)

    caption = models.CharField(max_length=255, blank=True)
    category = models.CharField(max_length=20, choices=[
        ('intake', 'Intake condition'), ('progress', 'Repair progress'),
        ('completion', 'Completion'), ('other', 'Other'),
    ], default='other')

    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    uploaded_via = models.CharField(max_length=20, choices=[
        ('web', 'Desktop upload'), ('mobile_link', 'QR mobile upload'),
    ], default='web')
    upload_link = models.ForeignKey('PhotoUploadLink', on_delete=models.SET_NULL, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)   # soft delete, see "evidence integrity" below

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=['content_type', 'object_id'], name='photo_content_object_idx'),
            models.Index(fields=['tenant', 'created_at']),
        ]
```

On `WorkItem`, `Task`, and `Asset` add `photos = GenericRelation(Photo)`, mirroring `WorkItem.notes = GenericRelation(Note)` (`backend/tasks/models.py:137`).

**Why generic FK over three separate FKs**: it's the established pattern in this codebase (`Note`, `EmailMessage` both use it), it's what makes attaching to Asset "free," and `TenantScopedMixin` + view-layer scoping (per `CLAUDE.md`) works the same way regardless of which model a photo hangs off.

`PhotoUploadLink` — the token model backing the QR mechanism:

```python
class PhotoUploadLink(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")

    token_hash = models.CharField(max_length=255, unique=True)   # never store plaintext — mirrors APIKey.key_hash
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()                          # short-lived, e.g. now + 30 minutes
    used_count = models.PositiveIntegerField(default=0)
```

This mirrors `APIKey`'s hashed-token pattern (`backend/core/models.py:251`) rather than inventing a new one. Unlike an `APIKey`, it's scoped to exactly one object and expires quickly — it's a single-purpose "session," not a standing credential.

## Storage

Local `MEDIA_ROOT` (`backend/app/settings.py:173-174`), consistent with the only existing `FileField` in the app (`EmailAttachment.file`, `upload_to='email_attachments/%Y/%m/'`). Use tenant-namespaced paths, following the same defensive isolation as `FORM_DOCUMENTS_PATH` (`settings.py:177`):

```
photos/{tenant_id}/{model}/{object_id}/{uuid}.{ext}
photos/{tenant_id}/{model}/{object_id}/thumbs/{uuid}.{ext}
```

**Operational fix required before shipping**: per project memory, Docker rebuilds bake backend code into the image with `docker compose build web && docker compose up -d web` for every deploy. Confirm (check `docker-compose.yml`, which wasn't found in a quick repo-root search — locate it) that `MEDIA_ROOT` is mounted as a **named, persistent volume**, not just a container-local directory. If it isn't, photos would be at risk of loss on the next rebuild. This is the single most important infra check before this feature ships anything durable — verify it explicitly as part of implementation, don't assume it's already handled just because `EmailAttachment` files haven't been lost yet.

**Do not copy `FormDocument`'s pattern** (manual `file_path = CharField()` + manual `os.path.join(MEDIA_ROOT, ...)` + manual `open()` in `backend/documents/views.py:1250`) — it's an inconsistency in the existing codebase, not a precedent to extend. Use Django's `ImageField`/`FileField` + storage API like `EmailAttachment` does; it gets you validation, safe path handling, and a swappable backend for free.

**Serving security**: don't expose photos via raw `MEDIA_URL` static serving. Route photo downloads through an authenticated, tenant-scoped view (session or API-key auth, like every other endpoint) that checks the requesting user's tenant matches `Photo.tenant` before streaming the file. Guessable sequential media URLs must not be reachable from outside the tenant that owns them.

**Future S3 migration path** (not built now, but the model should not block it): swapping `DEFAULT_FILE_STORAGE` for `django-storages` + S3/MinIO later requires no `Photo` model changes if `ImageField` is used correctly today — this is exactly why `ImageField` over a manual path string matters.

## Main Difficulties & Solutions

| Difficulty | Solution |
|---|---|
| **Storage growth** — photos are much larger than any existing attachment type | Enforce a per-photo size cap (e.g. 10MB) and an image-format allowlist (jpeg/png/heic/webp) at upload time; resize-on-ingest to a sane max dimension (e.g. 2560px longest edge) rather than storing raw phone-camera resolution (often 12MP+). Pillow is already a dependency. |
| **EXIF privacy leakage** — phone photos carry GPS + device metadata by default | Read EXIF orientation, apply it to physically rotate the image, then strip all EXIF on ingest (Pillow `Image.exif` removal). Never persist raw EXIF. |
| **Sideways/upside-down photos** — very common phone-upload bug when browsers ignore EXIF orientation | Same fix as above: normalize orientation server-side before strip, so display is correct everywhere regardless of client behavior. |
| **Slow gallery loading** — full-resolution photos in a Photos tab with many entries | Generate a `thumbnail` (e.g. 300px) synchronously on upload via Pillow (cheap enough not to need Celery for this size); serve thumbnails in list/gallery views, full image only on click-to-expand. |
| **Evidence integrity** — the dispute-avoidance use case only works if photos can't be silently altered or deleted | No edit-in-place; deletion is soft (`deleted_at`), never a hard delete, and always attributed (`uploaded_by`, `created_at` are immutable after creation). This mirrors the audit-trail thinking already present in `IntegrationRequestLog`. |
| **Multi-tenant leakage via storage paths** | Tenant-prefixed storage paths (above) *and* authenticated, tenant-checked serving view — never rely on the path alone being unguessable. |
| **Mobile auth bridge** — a phone browser has no session cookie, no CSRF token, no `X-Tenant` header (confirmed: `frontend/src/api/apiClient.js` is entirely session+cookie based) | The `PhotoUploadLink` token *is* the auth for the mobile upload page — no session needed, scoped to one object, short expiry, single technician-initiated "session." |

## Mobile Delivery: QR Code → Tokenized Upload Page

1. On the WorkItem detail page's new **Photos** tab (and equivalently in Task detail), an **"Add photos from phone"** button calls a new endpoint `POST /api/core/photo-upload-links/` with `{model: 'workitem', object_id}`. Server creates a `PhotoUploadLink` (random token, hashed like `APIKey`, `expires_at = now + 30min`), returns the **plaintext token once** (never stored) plus a full URL: `https://<tenant>.app.com/m/upload/<token>`.
2. Frontend renders that URL as a QR code client-side (new small dependency, e.g. `qrcode.react` — no existing QR library in the app today).
3. Technician scans with their phone's camera app — no app install, opens the URL in the phone's default browser.
4. That URL serves a minimal, unauthenticated-but-token-gated page (new lightweight route, not part of the main authenticated SPA shell) with one big control: `<input type="file" accept="image/*" capture="environment" multiple>` — this opens the native camera directly on mobile browsers, a zero-dependency HTML feature, no new library needed for capture itself.
5. Selected photos upload via `fetch`/`FormData` to `POST /api/core/photo-upload-links/<token>/photos/`, authenticated purely by the token (validated against `token_hash`, checked for `expires_at`, `used_count` incremented). This endpoint mirrors the upload pattern already used by `SendEmailView` (`backend/core/views.py:1216`): `request.FILES.getlist(...)`, wrapped in `transaction.atomic()`, `transaction.on_commit()` to enqueue any post-processing (thumbnail generation, if pushed to Celery for larger batches) only after the file is durably persisted.
6. Desktop Photos tab picks up new photos via simple polling while the QR modal is open (no need for websockets — matches the app's existing patterns elsewhere).
7. Link expires after 30 minutes or can be manually invalidated; it is single-object-scoped, so even if leaked it can't be used to attach photos anywhere else.

**Noted but deferred**: for courier/driver intake (`MoveMethod.COURIER`/`MoveMethod.DRIVER` already exist on `WorkItem.intake_method`), there's no shop screen to scan a QR code from. The existing inbound-email pipeline (Resend inbound webhook → tokenized reply routing → `EmailMessage`/`EmailAttachment`, see `docs/EMAIL_SETUP.md`) is nearly ready-made for an "email a photo to a work-item address" fallback for exactly this scenario, and is worth a fast-follow proposal — it reuses infrastructure that already works in production rather than adding anything new.

## Backend Changes (representative files)

- `backend/core/models.py` — add `Photo`, `PhotoUploadLink` (near `Note`/`EmailAttachment`).
- New migration in `backend/core/migrations/`.
- `backend/tasks/models.py` — add `photos = GenericRelation(Photo)` to `WorkItem` and `Task`.
- `backend/customers/models.py` — add `photos = GenericRelation(Photo)` to `Asset`.
- `backend/core/views.py` — `PhotoViewSet` (list/upload/soft-delete, `TenantScopedMixin`, generic `model`+`object_id` query params — same convention `EmailMessageListView`/Notes endpoints already use), `PhotoUploadLinkViewSet` (create/token-authenticated upload sub-route), authenticated photo-serving view.
- `backend/core/authentication.py` — small addition: a `PhotoUploadTokenAuthentication` class alongside the existing `APIKeyAuthentication`, following the same shape (hash lookup, expiry check).
- `backend/tenants/test_route_coverage.py` — new photo routes must be added to the scoped/allowlisted route coverage per `CLAUDE.md`'s route-coverage guardrail.

## Frontend Changes (representative files)

- `frontend/src/components/WorkItemTabs.jsx` — add a `photos` tab entry alongside `details`/`inventory`/`documents`/`emails`/`actions`.
- `frontend/src/pages/WorkItemDetail.jsx` — new conditional branch rendering a `PhotosTab` component, same pattern as the existing `documents`/`emails` branches.
- New `frontend/src/components/PhotosSection.jsx` (or similar) — reusable across WorkItem, Task, and Asset detail views: gallery grid with thumbnails, desktop drag-and-drop/file-pick upload (reuse `EmailComposer.jsx`'s `fileInputRef`/`handleFileChange` pattern at `frontend/src/components/EmailComposer.jsx:396-402`), and the "Add photos from phone" QR trigger.
- New `frontend/src/components/PhotoUploadQrModal.jsx` — requests a `PhotoUploadLink`, renders the QR code, polls for new photos while open.
- New standalone mobile upload route (outside the authenticated SPA shell) — plain page, camera-capture input, token-based fetch upload, minimal styling since it's used once per session on an unfamiliar device.
- `frontend/src/features/Tasks/TaskDetail.jsx` — has no existing tabs structure (confirmed), so `PhotosSection` slots in as a plain section rather than a new tab.
- `frontend/package.json` — add a QR-generation library (e.g. `qrcode.react`); nothing else new is required since native camera capture needs no library.

## Verification

- Backend: `cd backend && python manage.py test` covering `Photo`/`PhotoUploadLink` creation, tenant isolation (a photo created under tenant A must 404 for tenant B), token expiry/single-object-scoping, and the route-coverage guardrail test.
- Manual end-to-end: create a work item, open the Photos tab, upload via desktop drag-and-drop, generate a QR code, scan it with an actual phone on the same network as a local dev server (or via `ngrok`, same approach already documented for testing inbound email webhooks in `docs/EMAIL_SETUP.md`), take a photo, confirm it appears in the desktop tab within one poll interval, confirm EXIF/orientation is handled correctly, confirm thumbnails load fast in a gallery with 10+ photos.
- Confirm the Docker media volume persists photos across a `docker compose build web && docker compose up -d web` cycle (this validates the storage durability fix called out above) before considering this production-ready.
