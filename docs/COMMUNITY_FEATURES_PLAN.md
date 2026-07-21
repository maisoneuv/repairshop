# Cross-Tenant Community: Post-Based Feed (Tips + Part Requests)

## Context

The app is strictly tenant-isolated today, but the owner wants tenants (repair shops) to form a community: a shared knowledge base attached to device models ("serial number is under the battery"), a parts marketplace (a shop urgently needs a part, others offer to sell), and eventually repair outsourcing. Owner decisions: self-serve opt-in via a community profile; money stays off-app; profiles show trust signals (completed-deal counts + ratings); and — per review feedback — **a single generic `Post` model with kinds/tags instead of separate PartRequest/PartOffer/DeviceTip models**. Two structural exceptions to "just tags": an optional `device` FK (so tips surface on work items for that exact device model — free-text tags can't match reliably) and a `Reply` model with an accept handshake (needed for offer→accept→contact-exchange and the trust signals).

The architecture cooperates: `Device` (`backend/inventory/models.py:43`) is already a global, tenantless model with allowlisted views. The route-coverage guardrail (`backend/tenants/test_route_coverage.py`) provides a sanctioned, reviewed path for deliberately cross-tenant endpoints via `GLOBAL_ALLOWLIST` (lines 23-45). Nothing in `TenantScopedMixin` or the middleware is weakened; all cross-tenant data lives in a new `community` app with explicit tenant attribution.

## Architecture principles

- New Django app `backend/community/` owns ALL cross-tenant models/views. Register in `INSTALLED_APPS`; mount `path('api/community/', include('community.urls'))` in `backend/app/urls.py`.
- Models are tenantless but carry `posted_by_tenant`/`posted_by_user`, always stamped server-side from `request.tenant` (client-supplied values ignored; serializer read-only).
- **`community/mixins.py` — `CommunityWriteGuardMixin`** on every cross-tenant viewset:
  - `permission_classes = [IsAuthenticated, TenantUserMatchesRequestTenant]` (reuse `backend/core/permissions.py:7-27`)
  - `perform_create` stamps `posted_by_tenant=request.tenant`, `posted_by_user=request.user`
  - `perform_update`/`perform_destroy`: 403/404 unless `obj.posted_by_tenant_id == request.tenant.id`
  - writes require the tenant's `CommunityProfile.is_active == True` (reads need auth only)
- **`community/permissions.py` — `HasTenantPermission(codename)`** factory patterned on `ManageUsersPermission` (`backend/core/permissions.py:30-49`), delegating to `request.user.has_permission(codename, request.tenant)`.
- Two permission codenames only (declared in model `Meta.permissions`, grantable per-tenant via Role/RolePermission): `manage_community_profile`, `post_to_community` (covers posts, replies, votes, flags).
- Add `"community"` to `INCLUDED_APP_LABELS` in `backend/core/provisioning.py:17-26`; data migration reruns the idempotent `ensure_tenant_admin_role` for existing tenants.
- Opt-in gate = active `CommunityProfile` (self-serve; tenant admin flips `is_active`).
- Notifications: email via `send_system_email` (`backend/core/email_utils.py:8`) to `CommunityProfile.contact_email` — new reply on my post, reply accepted/declined, post closed. In-app notifications are future work.

## Models (`community/models.py`)

**`CommunityProfile`** — OneToOne to `tenants.Tenant`; `public_name`, `city`, `region`, `contact_email`, `contact_phone`, `specialties` (JSON list), `about`, `is_active` (default False), timestamps. Trust signals (denormalized): `completed_deals_count`, `rating_avg`, `rating_count`. `Meta.permissions = [('manage_community_profile', ...)]`.

**`Post`** — the one content model:
- `kind` — choices: `tip` (device knowledge), `part_request`, `question` (general discussion). Repair outsourcing later adds `repair_request` — no schema change.
- `posted_by_tenant` FK, `posted_by_user` FK (SET_NULL)
- `title` (blank allowed for tips), `content` (TextField)
- `device` FK → `inventory.Device`, null/blank, `related_name='community_posts'` — the structural anchor; SET_NULL
- `tags` JSONField list — free-form ("warning", "disassembly", "urgent", brand names…)
- `price` Decimal null (part_request: max price; informational, settlement off-app), `currency` (default PLN), `needed_by` DateField null
- `status` — `active` / `resolved` (deal done or question answered) / `cancelled` / `removed` (moderation), default `active`; `expires_at` null (lazy filter in queryset, no celery job in v1)
- `accepted_reply` FK → Reply, null, SET_NULL, related_name='+'
- `helpful_count` (denormalized from votes), timestamps
- Indexes: `(kind, status, -created_at)`, `(device, kind, status)`
- `Meta.permissions = [('post_to_community', 'Can post and reply in the community')]`

**`Reply`** — FK `post` (related_name `replies`), `posted_by_tenant`/`posted_by_user`, `content`, `price` Decimal null (an offer is just a reply with a price), `status` (`pending`/`accepted`/`declined`/`withdrawn`, default pending), `created_at`.

**`PostVote`** — FK post + FK user, `unique_together ('post','user')`; updates `helpful_count`.

**`PostFlag`** — FK post, `flagged_by_user` (SET_NULL), `flagged_by_tenant`, `reason`, `resolved` (default False). Post stays visible until a superuser sets `status='removed'` in Django admin.

**`DealRating`** — FK `post`, `rater_tenant`, `rated_tenant`, `score` 1–5, optional `comment`, `unique_together ('post','rater_tenant')`. Recomputes profile `rating_avg`/`rating_count` on save.

### Lifecycle (accept handshake)

Post with replies → poster **accepts** one reply (transactionally: set `accepted_reply`, mark it `accepted`, auto-decline sibling pending replies, email both parties each other's profile contact card) → poster marks post `resolved` when the deal is done → both parties may rate (`DealRating`); `completed_deals_count` increments for both tenants when a post with an accepted reply reaches `resolved`. Poster can `cancel` anytime while active. Tips/questions skip the handshake — they're just posts with replies and votes.

### PII containment

Posts anchor on the global `Device`, never `Asset` — no model path to customers or serial numbers. Serializers expose authors only as `author_shop` (profile `public_name`) + region; never user names/emails. Contact details revealed only via the accept flow (and they're already public in the directory — the reveal is UI convenience).

## Endpoints (`community/views.py`, `community/urls.py`)

| Endpoint | View | Scoping |
|---|---|---|
| `GET/PUT /api/community/profile/` (own) | `MyCommunityProfileView` | inherits `TenantScopedMixin` (`tenant_field="tenant"`) — NOT allowlisted |
| `GET /api/community/profiles/` (directory, active only) | `CommunityProfileDirectoryView` | `GLOBAL_ALLOWLIST` |
| `GET /api/community/posts/?kind=&device=&tag=&mine=posted\|replied`; `POST /posts/`; `PATCH/DELETE /posts/<id>` (own tenant); actions `cancel`, `resolve`, `rate`; `POST/DELETE /posts/<id>/vote/`; `POST /posts/<id>/flag/` | `PostViewSet` + `CommunityWriteGuardMixin` | `GLOBAL_ALLOWLIST` |
| `POST /api/community/posts/<id>/replies/`; `PATCH` own reply; actions `withdraw` (author), `accept`/`decline` (post's poster tenant only) | `ReplyViewSet` + `CommunityWriteGuardMixin` | `GLOBAL_ALLOWLIST` |

Allowlist entries in `backend/tenants/test_route_coverage.py` `GLOBAL_ALLOWLIST` with justification comment: community app is intentionally cross-tenant; writes stamped with `request.tenant` by `CommunityWriteGuardMixin`; mutations restricted to owning tenant; models carry no customer PII.

All writes gated on `post_to_community` + active profile. Moderation v1: superuser via Django admin (`community/admin.py` — resolve flags, remove posts).

## Frontend

- `frontend/src/features/Community/CommunityProfileSettings.jsx` — route `/settings/community` (add to authenticated block in `frontend/src/App.jsx:39-76`; link from `pages/SettingsPage.jsx`)
- `frontend/src/pages/CommunityHub.jsx` — route `/community`, nav entry in `AppLayout`: one feed with kind filter chips (All | Tips | Parts | Questions), tag filter, "My activity" (`?mine=`). Post composer adapts to kind (part_request shows price/needed-by fields; tip shows device picker + tag suggestions).
- `features/Community/PostDetail.jsx` — route `/community/posts/:id`: replies, vote/flag, accept/decline buttons (poster only), contact card after acceptance, rating prompt on resolve.
- `features/Community/DeviceTipsPanel.jsx` — queries `posts?kind=tip&device=<id>`; embedded in `pages/WorkItemDetail.jsx` (shown when the work item's `customer_asset.device` resolves — where technicians need it) with an inline add-tip form.

## Future (designed, not built)

- **Repair outsourcing** = `kind='repair_request'` reusing the same accept handshake, plus two additions when built: requester-only `origin_work_item` / provider-only `provider_work_item` FKs (exposed via SerializerMethodFields only to their owners; listing content is a poster-reviewed snapshot, never auto-copied from WorkItem, so customer PII can't leak) and a richer status set (`in_repair`, `repair_done`).
- Global part catalog (analogous to `Device`) and linking `InventoryItem` to it; in-app notifications model; Device dedup/merge (free-text model/manufacturer will fragment tips — relates to existing finding 1.6).

## Migrations & tests

1. `community/0001_initial` + data migration rerunning `ensure_tenant_admin_role` per tenant.
2. Route coverage: add `CommunityProfileDirectoryView`, `PostViewSet`, `ReplyViewSet` to `GLOBAL_ALLOWLIST`; `MyCommunityProfileView` must NOT be listed (stale-allowlist check enforces this).
3. New `backend/community/tests/test_isolation.py` (model on `tenants/test_isolation.py` two-tenant pattern):
   - client-supplied `posted_by_tenant` ignored; always stamped from `request.tenant`
   - tenant B cannot mutate tenant A's posts/replies (403/404); only the post's tenant can `accept`/`decline`/`resolve`/`cancel`; only reply author can `withdraw`
   - posting blocked when profile inactive (403); reading allowed
   - `accept` declines sibling replies atomically; vote uniqueness; flagged post stays visible until removed
   - non-owner response bodies contain no customer name/phone/serial/user email (assert on raw JSON)
4. Route-coverage test fails until routes are allowlisted — the intended review gate. Test env: `DB_USER=magda`, source `.env.local`; 18F+5E pre-existing failures in calls app are known.

## Verification

- `cd backend && python manage.py test community tenants` — isolation tests + route-coverage guardrail green
- Manual two-tenant walkthrough (two browsers, e.g. `repairhero.localhost:5173` + second tenant): activate both profiles → A posts a tip anchored to a Device → B sees it in the tips panel on a work item for that device model, votes helpful → B posts a part_request → A replies with a price → B accepts (both get emails, contact cards shown) → B resolves and rates → A's profile shows deal count + rating
- Inactive profile: can read, gets 403 on posting
- Django admin: flag review and post removal work

## Key files

- New: `backend/community/` (models, views, serializers, urls, mixins, permissions, notifications, admin, tests), `frontend/src/features/Community/`, `frontend/src/pages/CommunityHub.jsx`
- Modified: `backend/app/settings.py`, `backend/app/urls.py`, `backend/core/provisioning.py:17-26`, `backend/tenants/test_route_coverage.py:23-45`, `frontend/src/App.jsx:39-76`, `pages/SettingsPage.jsx`, `pages/WorkItemDetail.jsx`
