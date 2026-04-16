# Session Stability — Revised Fix Plan

## Context

Users are being prompted to login frequently even while actively working. The app is on
HTTPS, `logout_on_inactivity` is disabled, and the issue occurs when switching tabs (e.g.
to look up parts) and returning to the app. The experience varies — sometimes the tab
appears to reload, sometimes the login form just appears. Multiple issues compound to
cause this.

The app also has a **PIN-based quick login** used for station-switching (multiple
technicians sharing one computer). The desired security policy is:

> A technician who is actively using the app (even via PIN logins) should never be
> interrupted. A full password re-auth should only be required after a period of **genuine
> inactivity** — not based on a wall-clock timer since first login.

The revised fixes below implement an inactivity-based session model aligned with how
enterprise SaaS products (e.g. Salesforce) handle this, adapted for Django session-based
auth (no JWT/refresh tokens).

---

## Architecture Principle

The key conceptual shift across all fixes:

> **The session represents "this device/tab is trusted and active."**
> **The lock screen represents "who is currently at the keyboard."**
> These are two separate concerns and must not be conflated.

Currently, locking the screen calls `POST /api/core/logout/`, which destroys the Django
session. This collapses both concerns into one and forces a full re-auth whenever the
24h wall-clock check triggers. The fixes below separate them correctly.

---

## Root Cause Analysis

### Cause 1 (PRIMARY) — `hydrateFromMe` logs out on any error, not just expired sessions

**File:** `frontend/src/context/UserContext.jsx:180-188`

```js
} catch (err) {
    setUser(null);  // clears on 401, 500, network timeout, CORS hiccup, anything
    ...
}
```

`hydrateFromMe` runs on every app boot. Any transient error (network blip, gunicorn
worker restart, 500) clears `user`, and `App.jsx:32-38` immediately redirects to
`/login`. When Chrome/Edge discards and reloads a background tab, the app boots fresh,
makes the first API call, and if it gets any non-200 response — the user is kicked out.

This is the most likely cause of the "switched tabs and came back → must login" pattern.

---

### Cause 2 (SECONDARY) — `lockScreen()` destroys the Django session

**Files:** `frontend/src/context/UserContext.jsx:272-285`, `backend/core/views.py:294-295`

The lock button calls `POST /api/core/logout/` which destroys the Django session entirely.
When the user then enters their PIN, `quick_login_view` treats this as a brand-new login
and enforces the 24h wall-clock check:

```python
if not user.last_full_login_at or timezone.now() - user.last_full_login_at > timedelta(hours=24):
    return JsonResponse({"error": "full_login_required"}, status=HTTP_403_FORBIDDEN)
```

A technician who logs in at the start of their shift, locks the screen, and unlocks the
next morning is forced to full login — even if they've been actively working the whole
time. The 24h check is measured from login time, not inactivity.

---

### Cause 3 (MINOR) — Sessions not refreshed during read-only browsing

**File:** `backend/app/settings.py`

`SESSION_SAVE_EVERY_REQUEST` defaults to `False`. Django only renews the session expiry
when the session is modified (i.e. on write operations). Users who only browse (GETs)
have their session age from creation, not last activity. Combined with tab reloads, this
means sessions can expire silently during browse-only usage.

---

### Cause 4 (MINOR) — nginx overwrites `X-Forwarded-Proto` with internal scheme

**File:** `docker/nginx.conf:35-36`

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

`$scheme` is `http` (docker-internal), so Django always sees `X-Forwarded-Proto: http`
and `request.is_secure()` returns `False` despite external traffic arriving over HTTPS.
This can affect CSRF validation logic and internal Django security checks.

---

## Fixes

### Fix 1 — Only clear user state on genuine auth failures (most impactful)

**File:** `frontend/src/context/UserContext.jsx:180-188`

Only treat 401 and 403 as "session expired — log out." All other errors (5xx, network
timeouts, CORS hiccups) should preserve the existing user state so active users are not
booted by transient backend issues.

Optionally, schedule a silent retry of `hydrateFromMe` after 3 seconds on 5xx errors,
so that a gunicorn restart during a tab reload recovers automatically.

```js
} catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
        // Genuine auth failure — clear state and let router redirect to /login
        setUser(null);
        setEmployee(null);
        setPermissions([]);
        setAvailableTenants([]);
    }
    // For transient errors (5xx, network, timeout): preserve existing user state.
    // Optional: retry hydrateFromMe after 3s on 5xx so backend restarts self-heal.
    setError(err);
    setLoading(false);
}
```

---

### Fix 2 — Lock screen must not destroy the Django session

**Files:** `frontend/src/context/UserContext.jsx:198-210` (`triggerLock`), `272-285` (`lockScreen`)

Remove the `POST /api/core/logout/` call from both `lockScreen` and `triggerLock`. The
lock screen is a UI-level security overlay — it should suspend rendering, not end the
server session.

```js
const lockScreen = useCallback(async () => {
    setUser(null);
    setEmployee(null);
    setPermissions([]);
    setIsLocked(true);
    // Do NOT call /api/core/logout/ — session stays alive on the server
}, []);
```

Apply the same change to `triggerLock`.

---

### Fix 3 — Replace wall-clock 24h check with inactivity-based check

**Files:** `backend/core/views.py:294-295` (quick_login_view), `backend/core/models.py`
(User model), new middleware file

**The problem with the current approach:** `last_full_login_at` is a timestamp of when
the user first authenticated. Comparing against it means a technician who logs in Monday
at 8am and works actively all week still hits the wall at 8am Tuesday. This is a
calendar trigger, not a security-meaningful one.

**The correct model:** Track `last_activity_at` on the User model, updated on every
authenticated request via middleware. The PIN re-auth check compares against this
timestamp. A technician actively using the app never hits the wall, regardless of how
many days have passed since their last password login.

#### Step 3a — Add `last_activity_at` to the User model

**File:** `backend/core/models.py`

```python
class User(AbstractBaseUser, ...):
    ...
    last_activity_at = models.DateTimeField(null=True, blank=True)
```

Run `python manage.py makemigrations && python manage.py migrate` after this change.

#### Step 3b — Add middleware to update `last_activity_at` on every authenticated request

**New file:** `backend/core/middleware.py` (or append to existing middleware file)

Throttle the DB write to once every 5 minutes to avoid a write on every single request.

```python
from django.utils.timezone import now
from datetime import timedelta

class UpdateLastActivityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.user.is_authenticated:
            last = request.user.last_activity_at
            if not last or now() - last > timedelta(minutes=5):
                request.user.__class__.objects.filter(
                    pk=request.user.pk
                ).update(last_activity_at=now())
        return response
```

Register in `backend/app/settings.py` MIDDLEWARE list (after AuthenticationMiddleware):

```python
'core.middleware.UpdateLastActivityMiddleware',
```

#### Step 3c — Update `quick_login_view` to use inactivity check

**File:** `backend/core/views.py:294-295`

With Fix 2 applied, the Django session is still alive when the user enters their PIN
after locking. `request.user.is_authenticated` will be `True` in that case — skip the
inactivity check entirely, since the session itself proves continuity.

Only apply the inactivity check when there is no active session (e.g. a fresh browser
open, or a session that genuinely expired).

```python
already_authed = request.user.is_authenticated

if not already_authed:
    # No active session — apply inactivity window check
    inactivity_limit = timedelta(hours=8)  # one work shift; make this a Setting if needed
    last_activity = user.last_activity_at

    if not last_activity or now() - last_activity > inactivity_limit:
        return JsonResponse({"error": "full_login_required"}, status=403)

login(request, user)
return JsonResponse({"success": True})
```

The `inactivity_limit` value (8 hours above) should ideally be pulled from the tenant
`Setting` model so shop owners can configure it without a code change.

---

### Fix 4 — Roll session expiry forward on every request

**File:** `backend/app/settings.py`

Add both settings. `SESSION_SAVE_EVERY_REQUEST` ensures the session cookie TTL is
extended with every request (the Django equivalent of Salesforce's silent token
refresh). `SESSION_COOKIE_AGE` sets the outer bound — one full work shift is a
reasonable default.

```python
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_AGE = 60 * 60 * 12  # 12 hours
```

---

### Fix 5 — Forward the correct `X-Forwarded-Proto` in nginx

**File:** `docker/nginx.conf:35-36`

Forward the original header from the outer proxy rather than overwriting with the
docker-internal scheme:

```nginx
proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
```

Apply to both the `/api/` and `/admin/` location blocks.

---

### Fix 6 — Add a session heartbeat on tab focus (NEW)

**Files:** `frontend/src/context/UserContext.jsx` (new effect), `backend/core/views.py`
(new endpoint), `backend/core/urls.py`

This is the missing piece that prevents the "came back from another tab → kicked out"
scenario even with Fix 1 in place. When a background tab becomes active again, fire a
cheap dedicated endpoint before making any real API calls. This also updates
`last_activity_at` (via the middleware in Fix 3), keeping the inactivity timer alive for
users who are present but not actively clicking.

#### Backend — add a session ping endpoint

**File:** `backend/core/views.py`

```python
@login_required
def session_ping(request):
    # Middleware will update last_activity_at automatically.
    # This endpoint just needs to return 200 if session valid, 401 if not.
    return JsonResponse({"ok": True})
```

**File:** `backend/core/urls.py`

```python
path('session-ping/', views.session_ping, name='session-ping'),
```

#### Frontend — call ping on tab visibility change

**File:** `frontend/src/context/UserContext.jsx`

Add a `useEffect` that fires on mount and listens for the browser's `visibilitychange`
event. Only act on 401 — anything else (network error, 5xx) is ignored.

```js
useEffect(() => {
    const handleVisibilityChange = async () => {
        if (document.visibilityState !== 'visible') return;
        try {
            await axios.get('/api/core/session-ping/');
        } catch (err) {
            if (err?.response?.status === 401) {
                // Session genuinely expired while tab was in background
                setUser(null);
                setEmployee(null);
                setPermissions([]);
                setIsLocked(false);
            }
            // All other errors: ignore — assume session is still valid
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

---

## Implementation Order

Apply fixes in this sequence to avoid introducing regressions:

1. **Fix 4** — `SESSION_SAVE_EVERY_REQUEST` + `SESSION_COOKIE_AGE` (pure config, zero risk)
2. **Fix 5** — nginx proto header (pure config, zero risk)
3. **Fix 1** — resilient `hydrateFromMe` catch block (frontend only, self-contained)
4. **Fix 3a + 3b** — add `last_activity_at` field + middleware (backend, requires migration)
5. **Fix 2 + Fix 3c** — lock screen no longer calls logout + updated `quick_login_view` (must be deployed together — they are coupled)
6. **Fix 6** — session ping endpoint + frontend visibility handler (additive, can be last)

---

## Files Changed

| File | Fix(es) |
|---|---|
| `frontend/src/context/UserContext.jsx` | Fix 1 (line 180), Fix 2 (lines 198, 272), Fix 6 (new effect) |
| `backend/core/views.py` | Fix 3c (line 294), Fix 6 (new endpoint) |
| `backend/core/urls.py` | Fix 6 (new route) |
| `backend/core/models.py` | Fix 3a (`last_activity_at` field) |
| `backend/core/middleware.py` | Fix 3b (new middleware class) |
| `backend/app/settings.py` | Fix 3b (middleware registration), Fix 4 (session settings) |
| `docker/nginx.conf` | Fix 5 (lines 35-36) |

---

## Verification Checklist

| Fix | How to verify |
|---|---|
| Fix 1 | DevTools → Network → set throttle to Offline for 5s while logged in → restore → user should still be logged in |
| Fix 2 | Lock screen → inspect DevTools → Application → Cookies → `sessionid` cookie should still be present |
| Fix 3 | Lock screen → advance system clock past 8h → PIN unlock → should succeed without full login prompt (session alive) |
| Fix 3 (inactivity path) | Close browser completely → reopen after 8h → PIN unlock should require full password login |
| Fix 4 | Log in → browse read-only for several minutes → DevTools → Application → Cookies → `sessionid` expiry timestamp should advance with each request |
| Fix 5 | Check Django logs — `request.is_secure()` should return `True` for all HTTPS requests |
| Fix 6 | Log in → switch to another tab for a while → switch back → no login prompt; simulate expired session (clear `sessionid` cookie while in background tab) → switch back → login prompt appears cleanly |
