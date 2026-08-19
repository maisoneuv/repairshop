"""Tests for the incremental sync feeding the on-device caller cache."""

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Address, PicklistValue, User
from customers.models import Customer
from service.models import Employee, Location, RepairShop
from tasks.models import WorkItem
from tenants.models import Tenant

URL = "/api/mobile/sync/customers"


class SyncCustomersTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Fixed", subdomain="fixed")
        self.user = User.objects.create_user(
            username="agent", email="agent@fixed.test", password="pw", tenant=self.tenant
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="fixed")

    def _customer(self, first_name, phone="601234567"):
        return Customer.objects.create(
            tenant=self.tenant, first_name=first_name, phone_number=phone
        )

    def _work_item(self, customer, status="New"):
        address = Address.objects.create(
            street="Magnacka", building_number="7", city="Warszawa", postal_code="02-496"
        )
        shop = RepairShop.objects.create(
            tenant=self.tenant, name=f"Shop {address.pk}", type="internal", address=address
        )
        location = Location.objects.create(
            tenant=self.tenant, name=f"Loc {address.pk}", type="shop", shop=shop
        )
        employee = Employee.objects.filter(user=self.user).first() or Employee.objects.create(
            tenant=self.tenant, user=self.user, role="technician", location=location
        )
        return WorkItem.objects.create(
            tenant=self.tenant, customer=customer, description="Nie dziala",
            status=status, owner=employee, dropoff_point=location,
        )

    def test_returns_minimal_projection(self):
        self._customer("Jan", "601234567")
        data = self.client.get(URL).json()

        self.assertEqual(len(data["records"]), 1)
        record = data["records"][0]
        self.assertEqual(record["phone_e164"], "+48601234567")
        self.assertEqual(record["display_name"], "Jan")
        self.assertIn("has_open_work_item", record)
        # Nothing beyond what the call screen needs may leave the server.
        self.assertNotIn("email", record)
        self.assertNotIn("address", record)

    def test_customer_without_number_comes_back_as_tombstone(self):
        Customer.objects.create(
            tenant=self.tenant, first_name="Bez", email="bez@example.com"
        )
        data = self.client.get(URL).json()

        self.assertEqual(data["records"], [])
        self.assertEqual(len(data["tombstones"]), 1)
        self.assertTrue(data["tombstones"][0]["deleted"])

    def test_open_work_item_flag_uses_picklist_roles(self):
        PicklistValue.objects.update_or_create(
            tenant=self.tenant, category="workitem_status", value="wydane_bez_naprawy",
            defaults={"name": "Wydane bez naprawy", "status_role": "resolved"},
        )
        closed_customer = self._customer("Zamkniety", "601111111")
        open_customer = self._customer("Otwarty", "602222222")
        self._work_item(closed_customer, status="wydane_bez_naprawy")
        self._work_item(open_customer, status="New")

        by_id = {r["customer_id"]: r for r in self.client.get(URL).json()["records"]}
        self.assertFalse(by_id[closed_customer.id]["has_open_work_item"])
        self.assertTrue(by_id[open_customer.id]["has_open_work_item"])

    def test_paging_walks_every_record_without_repeats(self):
        for i in range(5):
            self._customer(f"Klient{i}", f"60000000{i}")

        seen = []
        params = {"limit": 2}
        for _ in range(5):
            data = self.client.get(URL, params).json()
            seen += [r["customer_id"] for r in data["records"]]
            if not data["has_more"]:
                break
            params = {"limit": 2, "cursor": data["next_cursor"], "since": data["next_since"] or ""}

        self.assertEqual(len(seen), 5)
        self.assertEqual(len(set(seen)), 5, "rekordy nie moga sie powtarzac miedzy stronami")

    def test_since_narrows_the_answer_to_recent_changes(self):
        """`since` is inclusive on purpose.

        Several rows can share a timestamp, so an exclusive filter would silently
        skip whichever of them landed after the cursor was taken. Re-sending a row
        the device already has is harmless - it overwrites its own copy - while
        losing one leaves a customer permanently unrecognised.
        """
        older = self._customer("Stary", "601111111")
        for _ in range(3):
            self._customer(f"Wypelniacz{_}", f"60333333{_}")
        cursor_time = self.client.get(URL).json()["next_since"]

        fresh = self._customer("Nowy", "602222222")
        ids = [r["customer_id"] for r in self.client.get(URL, {"since": cursor_time}).json()["records"]]

        self.assertIn(fresh.id, ids)
        self.assertNotIn(older.id, ids, "rekordy wyraznie starsze niz kursor nie moga wracac")

    def test_does_not_leak_other_tenant(self):
        other = Tenant.objects.create(name="Obcy", subdomain="obcy")
        Customer.objects.create(tenant=other, first_name="Cudzy", phone_number="609999999")
        self._customer("Nasz", "601234567")

        names = [r["display_name"] for r in self.client.get(URL).json()["records"]]
        self.assertEqual(names, ["Nasz"])

    def test_rejects_anonymous(self):
        resp = APIClient().get(URL, HTTP_X_TENANT="fixed")
        self.assertIn(resp.status_code, (401, 403))
