# Authentication & Session Management

## Overview

The app uses two separate, independent security concerns:

| Concern | Mechanism | Controls |
|---|---|---|
| **Device/session trust** | Django session cookie (`sessionid`) | Server-side; survives lock screen |
| **Who is at the keyboard** | Lock screen + PIN | UI-level overlay; does not affect session |

These must not be conflated. Locking the screen does not end the server session. A full logout does.

---

## Full Login

**Endpoint:** `POST /api/core/login/`
**Frontend:** `/login` route → `LoginPage.jsx` → `LoginForm`

Users authenticate with email and password. On success Django:
1. Creates a server-side session and sets the `sessionid` cookie.
2. Records `user.last_full_login_at` (used to enforce the inactivity re-auth policy).

The frontend calls `hydrateFromMe()` after login to populate user/employee/permissions state, then navigates to `/`.

**Session cookie settings:**
- `SESSION_COOKIE_SECURE = True` in production (HTTPS only)
- `SESSION_COOKIE_AGE = 43200` (12 hours)
- `SESSION_SAVE_EVERY_REQUEST = True` — the expiry timestamp rolls forward on every request, so active users are never silently expired

---

## Lock Screen

**Trigger:** Manual "Lock" button in the nav, or the inactivity timer (when `logout_on_inactivity` tenant setting is enabled).
**Component:** `frontend/src/components/LockScreen.jsx`

When the screen is locked:
- `user`, `employee`, and `permissions` are cleared from React state.
- `isLocked` is set to `true` — `App.jsx` renders `<LockScreen />` instead of the main app.
- **The Django session is NOT destroyed.** The `sessionid` cookie remains valid on the server.

This means the lock screen is a UI-level security overlay. It prevents access to the app UI without requiring a full password re-authentication for every lock/unlock cycle.

To unlock, the user enters their PIN (see below). To perform a full logout instead, the "Use full login" link clears `isLocked` and redirects to `/login`.

---

## PIN Quick Login

**Endpoint:** `POST /api/core/quick-login/`
**Frontend:** `LockScreen.jsx`

PIN login allows a technician to unlock the app (or switch to a different user on a shared workstation) without a full password re-entry.

### Setting a PIN

Users set their own 4–6 digit numeric PIN via `POST /api/core/users/me/pin/`.
Admins can set/clear PINs for any tenant user via `POST /api/core/users/<id>/pin/`.
PINs are stored as bcrypt hashes (`pin_hash` field on the User model).

### Lock screen flow

1. `LockScreen` fetches the list of users with PINs from `GET /api/core/users/pinned/` — a public endpoint that returns names and initials only (no sensitive data).
2. The technician taps their avatar tile and enters their PIN on the number pad (or keyboard).
3. PIN is submitted to `POST /api/core/quick-login/` with `user_id` and `pin`.
4. The backend validates the PIN hash and checks the inactivity window (see below).
5. On success, Django calls `login(request, user)` — setting the session to the unlocking user — and the frontend calls `unlockScreen()` which re-fetches the user profile.

The PIN pad auto-submits at 6 digits and supports keyboard input (0–9, Backspace, Enter). Wrong PINs show a shake animation.

### Inactivity re-auth policy

PIN login is only allowed within an **8-hour inactivity window** from the last recorded activity. The check is:

```
If no active session exists AND user.last_activity_at is older than 8 hours (or null):
    → return 403 full_login_required
```

**If a session is already active** (the user locked the screen without logging out), the inactivity check is skipped entirely — the session itself proves continuity. This means a technician who locks the screen at the end of their shift and unlocks the next morning will be asked for a full password login only if the session has expired (`SESSION_COOKIE_AGE = 12h`), not based on an arbitrary wall-clock timer.

`last_activity_at` is updated on every authenticated request via `UpdateLastActivityMiddleware`, throttled to once per 5 minutes to avoid unnecessary DB writes.

---

## Full Logout

**Endpoint:** `POST /api/core/logout/`

Full logout destroys the Django session server-side. The frontend additionally clears all user state, removes the stored tenant from localStorage, and navigates to `/login`.

This is distinct from locking — lock preserves the session, logout destroys it.

---

## Session Health Check (Tab Focus Ping)

**Endpoint:** `GET /api/core/session-ping/`
**Frontend:** `UserContext.jsx` — `visibilitychange` event listener

When a browser tab returns to the foreground, the frontend fires a lightweight ping to check whether the server-side session is still valid. This covers the scenario where a session expired while the tab was in the background (e.g. the tab was open overnight).

- **200 OK** → session is valid, no action taken.
- **401** → session genuinely expired; user state is cleared and the router redirects to `/login`.
- **Any other error** (5xx, network) → ignored; the user is not logged out.

This check is always active, regardless of the `logout_on_inactivity` tenant setting.

---

## Inactivity Lock (Optional)

Controlled by the **`logout_on_inactivity`** tenant setting (default: off).

When enabled, two mechanisms lock the screen automatically:

| Mechanism | Trigger |
|---|---|
| **Inactivity timer** | No mouse/keyboard/touch for `inactivity_timeout_minutes` minutes |
| **Visibility lock** | Tab hidden for ≥ 10 seconds (covers OS screen lock, computer sleep) |

Both call `triggerLock()` which locks the UI without ending the server session.

---

## Proxy & HTTPS

The app is served via **Cloudflare Tunnel → nginx → Django**. nginx forwards the `X-Forwarded-Proto` header from Cloudflare rather than using the internal `http` scheme, so Django's `request.is_secure()` correctly returns `True` for HTTPS traffic.

Relevant Django settings (already configured):
```python
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
```

---

## API Reference

| Method | Endpoint | Auth required | Description |
|---|---|---|---|
| `POST` | `/api/core/login/` | No | Full email/password login |
| `POST` | `/api/core/logout/` | No | Destroy session |
| `POST` | `/api/core/quick-login/` | No | PIN login / unlock |
| `GET` | `/api/core/session-ping/` | Yes | Session health check |
| `GET` | `/api/core/users/pinned/` | No | List users with PINs (lock screen tiles) |
| `POST` | `/api/core/users/me/pin/` | Yes | Set or clear own PIN |
| `POST` | `/api/core/users/<id>/pin/` | Yes (admin) | Set or clear PIN for any tenant user |
