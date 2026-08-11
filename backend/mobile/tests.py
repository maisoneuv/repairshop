"""Testy logowania aplikacji mobilnej."""

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Address, User
from customers.models import Customer
from mobile.models import MobileDevice
from service.models import Employee, Location, RepairShop
from tenants.models import Tenant

PASSWORD = "tajne-haslo-123"


def _make_employee(tenant, user, suffix=""):
    address = Address.objects.create(
        street="Magnacka", building_number="7", city="Warszawa", postal_code="02-496"
    )
    shop = RepairShop.objects.create(
        tenant=tenant, name=f"Serwis {address.pk}{suffix}", type="internal", address=address
    )
    location = Location.objects.create(
        tenant=tenant, name=f"Punkt {address.pk}{suffix}", type="shop", shop=shop
    )
    return Employee.objects.create(
        tenant=tenant, user=user, role="technician", location=location
    )


class MobileLoginTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Fixed", subdomain="fixed")
        self.user = User.objects.create_user(
            username="marian", email="marian@fixed.test", password=PASSWORD, tenant=self.tenant
        )
        self.employee = _make_employee(self.tenant, self.user)
        self.client = APIClient()

    def _login(self, **overrides):
        payload = {
            "email": "marian@fixed.test",
            "password": PASSWORD,
            "tenant": "fixed",
            "device_label": "Pixel 10 Pro",
        }
        payload.update(overrides)
        return self.client.post("/api/mobile/auth/login", payload, format="json")

    def test_login_returns_token_pair_and_registers_device(self):
        resp = self._login()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("access", data)
        self.assertIn("refresh", data)

        device = MobileDevice.objects.get(pk=data["device_id"])
        self.assertEqual(device.employee, self.employee)
        self.assertEqual(device.label, "Pixel 10 Pro")
        self.assertIsNotNone(device.last_seen_at)
        self.assertTrue(device.is_active)

    def test_wrong_password_is_rejected(self):
        self.assertEqual(self._login(password="zle").status_code, 401)

    def test_unknown_tenant_is_rejected(self):
        self.assertEqual(self._login(tenant="nieistnieje").status_code, 401)

    def test_account_from_another_tenant_is_rejected(self):
        Tenant.objects.create(name="Obcy", subdomain="obcy")
        self.assertEqual(self._login(tenant="obcy").status_code, 401)

    def test_user_without_employee_record_is_rejected(self):
        """Bez powiazanego pracownika nie da sie przypisac autora wpisom
        w CRM ani utworzyc zadania kontrolnego po rozmowie."""
        User.objects.create_user(
            username="ktos", email="ktos@fixed.test", password=PASSWORD, tenant=self.tenant
        )
        resp = self._login(email="ktos@fixed.test")
        self.assertEqual(resp.status_code, 403)

    def test_relogin_reuses_device_and_clears_revocation(self):
        first = self._login().json()
        device = MobileDevice.objects.get(pk=first["device_id"])
        device.revoked_at = "2026-01-01T00:00:00Z"
        device.save(update_fields=["revoked_at"])

        second = self._login().json()
        self.assertEqual(second["device_id"], first["device_id"])
        device.refresh_from_db()
        self.assertIsNone(device.revoked_at)


class MobileTokenLifecycleTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Fixed", subdomain="fixed")
        self.user = User.objects.create_user(
            username="marian", email="marian@fixed.test", password=PASSWORD, tenant=self.tenant
        )
        _make_employee(self.tenant, self.user)
        Customer.objects.create(
            tenant=self.tenant, first_name="Jan", phone_number="601234567"
        )
        self.client = APIClient()
        tokens = self.client.post(
            "/api/mobile/auth/login",
            {
                "email": "marian@fixed.test",
                "password": PASSWORD,
                "tenant": "fixed",
                "device_label": "Pixel",
            },
            format="json",
        ).json()
        self.access = tokens["access"]
        self.refresh = tokens["refresh"]
        self.device_id = tokens["device_id"]

    def test_access_token_authorises_lookup(self):
        """Token musi realnie otwierac endpoint, z ktorego korzysta telefon."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access}")
        resp = self.client.get(
            "/api/customers/api/customers/lookup/", {"phone": "+48601234567", "v": "2"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["match"], "customer")

    def test_token_ignores_spoofed_tenant_header(self):
        """Telefon z tokenem serwisu A nie moze czytac danych serwisu B,
        nawet podajac jego naglowek."""
        other = Tenant.objects.create(name="Obcy", subdomain="obcy")
        Customer.objects.create(
            tenant=other, first_name="Cudzy", phone_number="601234567"
        )

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {self.access}", HTTP_X_TENANT="obcy"
        )
        resp = self.client.get(
            "/api/customers/api/customers/lookup/", {"phone": "+48601234567", "v": "2"}
        )
        self.assertEqual(resp.status_code, 200)
        # Widzimy wlasnego klienta z serwisu "fixed", nie klienta z "obcy".
        self.assertEqual(resp.json()["customer"]["name"], "Jan")

    def test_refresh_rotates_the_token(self):
        resp = self.client.post(
            "/api/mobile/auth/refresh", {"refresh": self.refresh}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("access", data)
        self.assertNotEqual(data.get("refresh"), self.refresh)

    def test_used_refresh_token_cannot_be_reused(self):
        self.client.post("/api/mobile/auth/refresh", {"refresh": self.refresh}, format="json")
        second = self.client.post(
            "/api/mobile/auth/refresh", {"refresh": self.refresh}, format="json"
        )
        self.assertEqual(second.status_code, 401)

    def test_revoked_device_cannot_refresh(self):
        """Zdalne wylogowanie telefonu musi dzialac natychmiast."""
        device = MobileDevice.objects.get(pk=self.device_id)
        device.revoked_at = "2026-08-11T10:00:00Z"
        device.save(update_fields=["revoked_at"])

        resp = self.client.post(
            "/api/mobile/auth/refresh", {"refresh": self.refresh}, format="json"
        )
        self.assertEqual(resp.status_code, 401)

    def test_logout_revokes_the_device(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access}")
        resp = self.client.post(
            "/api/mobile/auth/logout", {"refresh": self.refresh}, format="json"
        )
        self.assertEqual(resp.status_code, 204)

        device = MobileDevice.objects.get(pk=self.device_id)
        self.assertIsNotNone(device.revoked_at)
