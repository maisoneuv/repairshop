"""
Login/PIN brute-force protection tests (security audit 2026-07, H-1).
"""
from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import User
from core.security import DEVICE_COOKIE_NAME, PIN_MAX_FAILURES
from tenants.models import Tenant


class AuthHardeningTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Shop", subdomain="shop")
        cls.user = User.objects.create_user(
            username="tech@shop.test",
            email="tech@shop.test",
            password="real-password",
            tenant=cls.tenant,
        )
        cls.user.pin_hash = make_password("1234")
        cls.user.save(update_fields=["pin_hash"])

    def setUp(self):
        cache.clear()  # throttle + lockout state is cache-backed
        self.client = APIClient()

    def _full_login(self, client=None):
        """Password login; also plants the trusted-device cookie on the client."""
        client = client or self.client
        resp = client.post(
            "/api/core/login/",
            {"email": "tech@shop.test", "password": "real-password"},
            format="json",
            HTTP_X_TENANT="shop",
        )
        self.assertEqual(resp.status_code, 200)
        return resp

    def _quick_login(self, pin, client=None):
        return (client or self.client).post(
            "/api/core/quick-login/",
            {"user_id": self.user.id, "pin": pin},
            format="json",
            HTTP_X_TENANT="shop",
        )


class TrustedDeviceGateTests(AuthHardeningTestBase):
    def test_login_sets_trusted_device_cookie(self):
        resp = self._full_login()
        self.assertIn(DEVICE_COOKIE_NAME, resp.cookies)

    def test_pinned_users_empty_for_unknown_device(self):
        resp = self.client.get("/api/core/users/pinned/", HTTP_X_TENANT="shop")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["users"], [])

    def test_pinned_users_listed_for_trusted_device(self):
        self._full_login()
        self.client.post("/api/core/logout/", HTTP_X_TENANT="shop")
        resp = self.client.get("/api/core/users/pinned/", HTTP_X_TENANT="shop")
        ids = [u["id"] for u in resp.json()["users"]]
        self.assertIn(self.user.id, ids)

    def test_quick_login_refused_for_unknown_device(self):
        resp = self._quick_login("1234")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["error"], "full_login_required")


class PinLockoutTests(AuthHardeningTestBase):
    def setUp(self):
        super().setUp()
        # Trust this browser and keep the session (lock-screen scenario).
        self._full_login()

    def test_lockout_after_repeated_failures(self):
        for _ in range(PIN_MAX_FAILURES):
            resp = self._quick_login("0000")
            self.assertEqual(resp.status_code, 401)
        # Even the correct PIN is refused while locked.
        resp = self._quick_login("1234")
        self.assertEqual(resp.status_code, 429)

    def test_correct_pin_resets_failure_counter(self):
        for _ in range(PIN_MAX_FAILURES - 1):
            self._quick_login("0000")
        self.assertEqual(self._quick_login("1234").status_code, 200)
        # Counter was cleared: further failures start from zero.
        self.assertEqual(self._quick_login("0000").status_code, 401)


class LoginThrottleTests(AuthHardeningTestBase):
    def test_login_endpoint_throttled(self):
        last = None
        for _ in range(11):  # rate is 10/min
            last = self.client.post(
                "/api/core/login/",
                {"email": "tech@shop.test", "password": "wrong"},
                format="json",
                HTTP_X_TENANT="shop",
            )
        self.assertEqual(last.status_code, 429)
