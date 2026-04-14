from django.test import TestCase
from rest_framework.test import APIClient
from tenants.models import Tenant
from customers.models import Customer, Lead


class CustomerLookupAPITest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant", subdomain="testco")
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            first_name="Jan",
            last_name="Kowalski",
            phone_number="123456789",
        )
        self.client = APIClient()

    def _get(self, phone):
        return self.client.get(
            "/api/customers/api/customers/lookup/",
            {"phone": phone},
            HTTP_X_TENANT="testco",
        )

    def test_returns_customer_id(self):
        resp = self._get("123456789")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("id", resp.json()["customer"])
        self.assertEqual(resp.json()["customer"]["id"], self.customer.id)

    def test_returns_active_work_items_key(self):
        resp = self._get("123456789")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("active_work_items", data)
        self.assertIn("latest_closed_work_item", data)
        self.assertIsInstance(data["active_work_items"], list)

    def test_404_for_unknown_phone(self):
        resp = self._get("999999999")
        self.assertEqual(resp.status_code, 404)


class LeadCallbackStatusTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="CB Tenant", subdomain="cbtest")

    def test_lead_can_have_callback_status(self):
        lead = Lead.objects.create(
            tenant=self.tenant,
            first_name="Test",
            phone_number="600000001",
            status="callback",
        )
        lead.refresh_from_db()
        self.assertEqual(lead.status, "callback")

    def test_callback_in_status_choices(self):
        choices_values = [c[0] for c in Lead.STATUS_CHOICES]
        self.assertIn("callback", choices_values)
