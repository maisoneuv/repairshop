"""
Brute-force protection for the login and lock-screen endpoints
(security audit 2026-07, H-1).

Three layers:
- Scoped IP throttles on the login/PIN endpoints.
- A per-user failed-PIN counter with a temporary lock.
- A signed "trusted device" cookie, issued on full password login, that gates
  the pinned-users list and PIN login for unauthenticated requests — so the
  lock screen keeps working on shop terminals, but a remote attacker can
  neither enumerate users nor submit PINs.
"""
from django.conf import settings
from django.core import signing
from django.core.cache import cache
from rest_framework.throttling import AnonRateThrottle

# --- Scoped IP throttles -----------------------------------------------------

class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class PinLoginRateThrottle(AnonRateThrottle):
    scope = 'pin_login'


class PinnedUsersRateThrottle(AnonRateThrottle):
    scope = 'pinned_users'


# --- Per-user PIN attempt lockout --------------------------------------------

PIN_MAX_FAILURES = 5
PIN_LOCKOUT_SECONDS = 15 * 60


def pin_login_locked(user_id) -> bool:
    return cache.get(f'pin_lock:{user_id}') is not None


def register_pin_failure(user_id):
    key = f'pin_fail:{user_id}'
    try:
        failures = cache.incr(key)
    except ValueError:  # key missing/expired
        cache.set(key, 1, timeout=PIN_LOCKOUT_SECONDS)
        failures = 1
    if failures >= PIN_MAX_FAILURES:
        cache.set(f'pin_lock:{user_id}', True, timeout=PIN_LOCKOUT_SECONDS)
        cache.delete(key)


def clear_pin_failures(user_id):
    cache.delete(f'pin_fail:{user_id}')
    cache.delete(f'pin_lock:{user_id}')


# --- Trusted device cookie ----------------------------------------------------

DEVICE_COOKIE_NAME = 'fs_trusted_device'
DEVICE_COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 days
_DEVICE_COOKIE_SALT = 'core.lockscreen.device'


def issue_device_cookie(response, tenant_id):
    """Mark this browser as trusted for the tenant's lock screen."""
    value = signing.dumps({'t': tenant_id}, salt=_DEVICE_COOKIE_SALT)
    response.set_cookie(
        DEVICE_COOKIE_NAME,
        value,
        max_age=DEVICE_COOKIE_MAX_AGE,
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
    )
    return response


def has_valid_device_cookie(request, tenant) -> bool:
    raw = request.COOKIES.get(DEVICE_COOKIE_NAME)
    if not raw or tenant is None:
        return False
    try:
        payload = signing.loads(
            raw, salt=_DEVICE_COOKIE_SALT, max_age=DEVICE_COOKIE_MAX_AGE
        )
    except signing.BadSignature:
        return False
    return payload.get('t') == tenant.pk
