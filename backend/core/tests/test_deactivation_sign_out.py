from django.contrib.sessions.models import Session
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import User
from mobile.models import MobileDevice
from mobile.tests import PASSWORD, _make_employee
from tenants.models import Tenant


class DeactivationSignsOutEverywhereTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Fixed", subdomain="fixed")
        self.user = User.objects.create_user(
            username="marian", email="marian@fixed.test", password=PASSWORD, tenant=self.tenant
        )
        self.employee = _make_employee(self.tenant, self.user)
        self.other = User.objects.create_user(
            username="ola", email="ola@fixed.test", password=PASSWORD, tenant=self.tenant
        )

    def _web_client(self, email):
        client = APIClient(HTTP_X_TENANT="fixed")
        resp = client.post("/api/core/login/", {"email": email, "password": PASSWORD}, format="json")
        self.assertEqual(resp.status_code, 200)
        return client

    def _deactivate(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.user.is_active = False
            self.user.save()

    def test_web_session_stays_dead_after_reactivation(self):
        lost_phone = self._web_client("marian@fixed.test")
        self._deactivate()
        self.user.is_active = True
        self.user.save()

        self.assertEqual(lost_phone.get("/api/core/session-ping/").status_code, 403)

    def test_other_users_sessions_survive(self):
        colleague = self._web_client("ola@fixed.test")
        self._web_client("marian@fixed.test")
        self._deactivate()

        self.assertEqual(colleague.get("/api/core/session-ping/").status_code, 200)
        self.assertEqual(Session.objects.count(), 1)

    def test_mobile_device_is_signed_out_and_cannot_refresh(self):
        client = APIClient()
        tokens = client.post("/api/mobile/auth/login", {
            "email": "marian@fixed.test", "password": PASSWORD,
            "tenant": "fixed", "device_label": "Pixel",
        }, format="json").json()
        self._deactivate()
        self.user.is_active = True
        self.user.save()

        self.assertFalse(MobileDevice.objects.get(pk=tokens["device_id"]).is_active)
        resp = client.post("/api/mobile/auth/refresh", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_saving_an_active_user_signs_nothing_out(self):
        client = self._web_client("marian@fixed.test")
        with self.captureOnCommitCallbacks(execute=True):
            self.user.first_name = "Marian"
            self.user.save()

        self.assertEqual(client.get("/api/core/session-ping/").status_code, 200)
