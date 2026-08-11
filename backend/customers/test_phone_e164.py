"""Tests for E.164 normalisation and for agreement between both match paths.

A number stored without a prefix and a number delivered by the phone with one
must resolve to the same customer, whichever endpoint is asked.
"""

from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from calls.models import Call
from core.models import Address, PicklistValue, User
from core.phone import to_e164, to_e164_from_parts
from core.security import CustomerLookupThrottle
from customers.models import Customer, Lead
from service.models import Employee, Location, RepairShop
from tasks.models import WorkItem
from tenants.models import Tenant

# A customer stored the way the vast majority of records look: bare nine
# digits, with `prefix` left empty.
NATIONAL = "601234567"
E164 = "+48601234567"


class PhoneNormalizationUnitTest(TestCase):
    """The normalisation helper on its own, without the database."""

    def test_national_number_gets_country_code(self):
        self.assertEqual(to_e164(NATIONAL), E164)

    def test_already_e164_is_stable(self):
        self.assertEqual(to_e164(E164), E164)

    def test_spaces_and_separators_ignored(self):
        self.assertEqual(to_e164("601 234 567"), E164)
        self.assertEqual(to_e164("+48 601-234-567"), E164)

    def test_garbage_returns_none(self):
        self.assertIsNone(to_e164("RMA-2026-1234"))
        self.assertIsNone(to_e164(""))
        self.assertIsNone(to_e164(None))

    def test_explicit_prefix_wins_over_region(self):
        """A UK number must not be treated as Polish."""
        self.assertEqual(to_e164_from_parts("+44", "7911123456", "PL"), "+447911123456")


class CustomerPhoneE164Test(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="E164 Tenant", subdomain="e164test")

    def test_save_fills_e164_from_bare_national_number(self):
        customer = Customer.objects.create(
            tenant=self.tenant, first_name="Jan", phone_number=NATIONAL
        )
        self.assertEqual(customer.phone_e164, E164)

    def test_save_respects_explicit_prefix(self):
        """Foreign numbers are tested on Lead, because `Customer.phone_number` is
        max_length=9 and a longer number simply does not fit - an existing schema
        limitation, not a consequence of this change."""
        lead = Lead.objects.create(
            tenant=self.tenant, first_name="Nigel", prefix="+44", phone_number="7911123456"
        )
        self.assertEqual(lead.phone_e164, "+447911123456")

    def test_lead_gets_e164_too(self):
        lead = Lead.objects.create(
            tenant=self.tenant, first_name="Anna", phone_number=NATIONAL
        )
        self.assertEqual(lead.phone_e164, E164)

    def test_customer_without_phone_has_no_e164(self):
        customer = Customer.objects.create(
            tenant=self.tenant, first_name="Bez", email="bez@example.com"
        )
        self.assertIsNone(customer.phone_e164)


class EndpointAgreementTest(TestCase):
    """Both endpoints must resolve the same customer for the same number.

    Drift between them shows up as a call recorded with no customer while a
    parallel lookup finds that very customer.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Agree Tenant", subdomain="agreetest")
        self.user = User.objects.create_user(
            username="agent", email="agent@agree.test", password="pw", tenant=self.tenant
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, first_name="Jan", last_name="Kowalski", phone_number=NATIONAL
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="agreetest")

    def _register_call(self, phone):
        return self.client.post(
            "/api/calls/incoming/", {"phone_number": phone, "type": "incoming"}, format="json"
        )

    def _lookup(self, phone, v2=False):
        params = {"phone": phone}
        if v2:
            params["v"] = "2"
        return self.client.get("/api/customers/api/customers/lookup/", params)

    def test_both_endpoints_agree_for_e164_input(self):
        """A prefixed number against a record stored without a prefix."""
        call_resp = self._register_call(E164)
        self.assertEqual(call_resp.status_code, 201)
        call = Call.objects.get(pk=call_resp.json()["id"])
        self.assertEqual(call.customer_id, self.customer.id)

        lookup_resp = self._lookup(E164)
        self.assertEqual(lookup_resp.status_code, 200)
        self.assertEqual(lookup_resp.json()["customer"]["id"], self.customer.id)

    def test_both_endpoints_agree_for_national_input(self):
        """Same customer, number without a prefix - Android delivers both forms."""
        call_resp = self._register_call(NATIONAL)
        call = Call.objects.get(pk=call_resp.json()["id"])
        self.assertEqual(call.customer_id, self.customer.id)

        lookup_resp = self._lookup(NATIONAL)
        self.assertEqual(lookup_resp.json()["customer"]["id"], self.customer.id)

    def test_formatting_does_not_change_the_answer(self):
        for variant in (E164, NATIONAL, "601 234 567", "+48 601 234 567"):
            with self.subTest(variant=variant):
                resp = self._lookup(variant)
                self.assertEqual(resp.status_code, 200, msg=f"not recognised: {variant}")
                self.assertEqual(resp.json()["customer"]["id"], self.customer.id)

    def test_unknown_number_links_no_customer(self):
        call_resp = self._register_call("+48999888777")
        call = Call.objects.get(pk=call_resp.json()["id"])
        self.assertIsNone(call.customer_id)
        self.assertIsNone(call.lead_id)

    def test_call_links_lead_when_no_customer(self):
        lead = Lead.objects.create(
            tenant=self.tenant, first_name="Ewa", phone_number="602333444"
        )
        call_resp = self._register_call("+48602333444")
        call = Call.objects.get(pk=call_resp.json()["id"])
        self.assertIsNone(call.customer_id)
        self.assertEqual(call.lead_id, lead.id)


class LookupV2ContractTest(TestCase):
    """The ?v=2 contract used by the mobile app."""

    def setUp(self):
        self.tenant = Tenant.objects.create(name="V2 Tenant", subdomain="v2test")
        self.user = User.objects.create_user(
            username="v2agent", email="v2@test.test", password="pw", tenant=self.tenant
        )
        self.customer = Customer.objects.create(
            tenant=self.tenant, first_name="Anna", last_name="Nowak", phone_number=NATIONAL
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="v2test")

    def _lookup(self, phone):
        return self.client.get(
            "/api/customers/api/customers/lookup/", {"phone": phone, "v": "2"}
        )

    def _picklist(self, value, role, name):
        # A tenant gets a default set of statuses on creation, so some values
        # ("New", "Resolved") already exist - we overwrite role and name.
        pv, _ = PicklistValue.objects.update_or_create(
            tenant=self.tenant,
            category="workitem_status",
            value=value,
            defaults={"name": name, "status_role": role},
        )
        return pv

    def _work_item(self, status="New"):
        address = Address.objects.create(
            street="Test", building_number="1", city="Warszawa", postal_code="00-001"
        )
        shop = RepairShop.objects.create(
            tenant=self.tenant, name=f"Shop {address.pk}", type="internal", address=address
        )
        location = Location.objects.create(
            tenant=self.tenant, name="Loc", type="shop", shop=shop
        )
        employee = Employee.objects.filter(user=self.user).first() or Employee.objects.create(
            tenant=self.tenant, user=self.user, role="technician", location=location
        )
        return WorkItem.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            description="Nie wlacza sie",
            status=status,
            owner=employee,
            dropoff_point=location,
        )

    def test_unknown_number_returns_200_not_404(self):
        """The app must tell 'not a customer' apart from 'the request failed'."""
        resp = self._lookup("+48999888777")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["match"], "none")

    def test_known_customer_reports_match_customer(self):
        resp = self._lookup(E164)
        data = resp.json()
        self.assertEqual(data["match"], "customer")
        self.assertEqual(data["customer"]["id"], self.customer.id)
        self.assertEqual(data["customer"]["name"], "Anna Nowak")

    def test_lead_reports_match_lead(self):
        Lead.objects.create(tenant=self.tenant, first_name="Ewa", phone_number="602333444")
        data = self._lookup("+48602333444").json()
        self.assertEqual(data["match"], "lead")
        self.assertIsNone(data["customer"])

    def test_open_status_is_not_closed_and_uses_picklist_label(self):
        self._picklist("Naprawione", "in_progress", "Naprawione")
        self._work_item(status="Naprawione")

        item = self._lookup(E164).json()["latest_work_item"]
        self.assertEqual(item["stage_label"], "Naprawione")
        self.assertFalse(item["is_closed"])

    def test_resolved_role_marks_item_closed(self):
        """A status whose role is `resolved` closes the item even if it is not
        called 'Resolved' - the picklist role decides, not the name."""
        self._picklist("wydane_bez_naprawy", "resolved", "Wydane bez naprawy")
        self._work_item(status="wydane_bez_naprawy")

        data = self._lookup(E164).json()
        self.assertTrue(data["latest_work_item"]["is_closed"])
        self.assertEqual(data["latest_work_item"]["stage_label"], "Wydane bez naprawy")
        self.assertEqual(data["open_work_item_count"], 0)

    def test_open_count_ignores_closed_items(self):
        self._picklist("New", "initial", "Nowe")
        self._picklist("Resolved", "resolved", "Zakonczone")
        self._work_item(status="New")
        self._work_item(status="Resolved")
        self._work_item(status="Resolved")

        self.assertEqual(self._lookup(E164).json()["open_work_item_count"], 1)

    def test_unknown_status_counts_as_open(self):
        """A status outside the picklist counts as open: staying silent about an
        ongoing repair is worse than showing one time too many."""
        self._work_item(status="Status Ktorego Nie Ma")
        data = self._lookup(E164).json()
        self.assertFalse(data["latest_work_item"]["is_closed"])
        self.assertEqual(data["open_work_item_count"], 1)


class LookupThrottleTest(TestCase):
    """The endpoint answers "whose number is this", so without a limit it can
    be used to harvest a list of customers with their names."""

    def setUp(self):
        cache.clear()  # the throttle counter lives in the cache and leaks between tests
        self.tenant = Tenant.objects.create(name="Throttle", subdomain="throttletest")
        self.user = User.objects.create_user(
            username="t", email="t@test.test", password="pw", tenant=self.tenant
        )
        Customer.objects.create(
            tenant=self.tenant, first_name="Jan", phone_number=NATIONAL
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="throttletest")

    def tearDown(self):
        cache.clear()

    def _lookup(self):
        return self.client.get("/api/customers/api/customers/lookup/", {"phone": E164})

    @patch.object(CustomerLookupThrottle, "get_rate", return_value="3/min")
    def test_blocks_after_limit(self, _mocked_rate):
        for attempt in range(3):
            self.assertEqual(self._lookup().status_code, 200, msg=f"proba {attempt + 1}")
        self.assertEqual(self._lookup().status_code, 429)


class LookupTenantIsolationTest(TestCase):
    """A phone bound to tenant A must not resolve a number from tenant B."""

    def setUp(self):
        self.tenant_a = Tenant.objects.create(name="A", subdomain="tenanta")
        self.tenant_b = Tenant.objects.create(name="B", subdomain="tenantb")
        self.user_a = User.objects.create_user(
            username="a", email="a@test.test", password="pw", tenant=self.tenant_a
        )
        # The same number under both tenants - a real case with shared customers.
        self.customer_b = Customer.objects.create(
            tenant=self.tenant_b, first_name="Obcy", phone_number=NATIONAL
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user_a)
        self.client.credentials(HTTP_X_TENANT="tenanta")

    def test_lookup_does_not_leak_other_tenant_customer(self):
        resp = self.client.get(
            "/api/customers/api/customers/lookup/", {"phone": E164, "v": "2"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["match"], "none")

    def test_incoming_call_does_not_link_other_tenant_customer(self):
        resp = self.client.post(
            "/api/calls/incoming/", {"phone_number": E164}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        call = Call.objects.get(pk=resp.json()["id"])
        self.assertIsNone(call.customer_id)
        self.assertEqual(call.tenant_id, self.tenant_a.id)
