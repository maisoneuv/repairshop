from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from tenants.models import Tenant
from customers.models import Customer, Lead
from calls.models import Call
from core.models import User


class MarkHandledLeadNotesTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant", subdomain="callstest")
        self.user = User.objects.create_user(
            email="test@test.com",
            password="testpass",
            username="testuser",
            tenant=self.tenant,
        )
        self.lead = Lead.objects.create(
            tenant=self.tenant,
            first_name="Anna",
            phone_number="600100200",
        )
        self.call = Call.objects.create(
            tenant=self.tenant,
            phone_number="+48600100200",
            lead=self.lead,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="callstest")

    def test_notes_appended_to_lead(self):
        resp = self.client.post(
            f"/api/calls/{self.call.id}/handled/",
            {"notes": "Klient zainteresowany"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.lead.refresh_from_db()
        self.assertIn("Klient zainteresowany", self.lead.notes)

    def test_notes_include_date_prefix(self):
        resp = self.client.post(
            f"/api/calls/{self.call.id}/handled/",
            {"notes": "test notatka"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.lead.refresh_from_db()
        today = timezone.now().strftime("%Y-%m-%d")
        self.assertIn(f"[{today}]", self.lead.notes)

    def test_notes_appended_to_existing(self):
        self.lead.notes = "Stara notatka"
        self.lead.save()
        self.client.post(
            f"/api/calls/{self.call.id}/handled/",
            {"notes": "Nowa notatka"},
            format="json",
        )
        self.lead.refresh_from_db()
        self.assertIn("Stara notatka", self.lead.notes)
        self.assertIn("Nowa notatka", self.lead.notes)

    def test_empty_notes_not_appended(self):
        self.client.post(
            f"/api/calls/{self.call.id}/handled/",
            {"notes": ""},
            format="json",
        )
        self.lead.refresh_from_db()
        self.assertIsNone(self.lead.notes)

    def test_no_lead_no_error(self):
        call_no_lead = Call.objects.create(
            tenant=self.tenant,
            phone_number="+48700100200",
        )
        resp = self.client.post(
            f"/api/calls/{call_no_lead.id}/handled/",
            {"notes": "notatka bez leada"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)


class CallNewFieldsTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Fields Tenant", subdomain="fieldstest")

    def test_call_stores_duration(self):
        call = Call.objects.create(
            tenant=self.tenant,
            phone_number="+48500000001",
            duration=145,
        )
        call.refresh_from_db()
        self.assertEqual(call.duration, 145)

    def test_call_stores_status(self):
        call = Call.objects.create(
            tenant=self.tenant,
            phone_number="+48500000002",
            status="Sukces",
        )
        call.refresh_from_db()
        self.assertEqual(call.status, "Sukces")

    def test_call_duration_nullable(self):
        call = Call.objects.create(
            tenant=self.tenant,
            phone_number="+48500000003",
        )
        call.refresh_from_db()
        self.assertIsNone(call.duration)

    def test_call_status_blank_by_default(self):
        call = Call.objects.create(
            tenant=self.tenant,
            phone_number="+48500000004",
        )
        call.refresh_from_db()
        self.assertEqual(call.status, "")


class IncomingCallViewTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Incoming Tenant", subdomain="incomingtest")
        self.user = User.objects.create_user(
            email="inc@test.com",
            password="pass",
            username="incuser",
            tenant=self.tenant,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="incomingtest")

    def test_unknown_number_does_not_create_lead(self):
        resp = self.client.post(
            "/api/calls/incoming/",
            {"phone_number": "+48555666777", "type": "incoming"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.json().get("lead"))
        self.assertEqual(Lead.objects.filter(tenant=self.tenant).count(), 0)

    def test_saves_type_field(self):
        resp = self.client.post(
            "/api/calls/incoming/",
            {"phone_number": "+48555666778", "type": "outbound"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        call = Call.objects.get(id=resp.json()["id"])
        self.assertEqual(call.type, "outbound")

    def test_links_existing_customer(self):
        customer = Customer.objects.create(
            tenant=self.tenant,
            first_name="Anna",
            last_name="Nowak",
            phone_number="600111222",
        )
        resp = self.client.post(
            "/api/calls/incoming/",
            {"phone_number": "600111222", "type": "incoming"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["customer"], customer.id)
        self.assertIsNotNone(data["customer_name"])

    def test_links_existing_lead(self):
        lead = Lead.objects.create(
            tenant=self.tenant,
            first_name="Piotr",
            phone_number="600333444",
            status="new",
        )
        resp = self.client.post(
            "/api/calls/incoming/",
            {"phone_number": "600333444", "type": "incoming"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["lead"], lead.id)

    def test_response_contains_required_fields(self):
        resp = self.client.post(
            "/api/calls/incoming/",
            {"phone_number": "+48555666779", "type": "incoming"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        for field in ["id", "type", "phone_number", "customer_name", "lead_name", "work_items"]:
            self.assertIn(field, data)


class UpdateCallViewTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Patch Tenant", subdomain="patchtest")
        self.user = User.objects.create_user(
            email="patch@test.com",
            password="pass",
            username="patchuser",
            tenant=self.tenant,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="patchtest")

    def _make_call(self, phone="+48500000099", customer=None, lead=None):
        return Call.objects.create(
            tenant=self.tenant,
            phone_number=phone,
            customer=customer,
            lead=lead,
        )

    def test_patch_duration_only(self):
        call = self._make_call()
        resp = self.client.patch(
            f"/api/calls/{call.id}/",
            {"duration": 120},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        call.refresh_from_db()
        self.assertEqual(call.duration, 120)
        self.assertIsNone(call.handled_at)  # no status → not handled yet

    def test_patch_status_sukces_creates_lead(self):
        call = self._make_call(phone="+48600000001")
        resp = self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Sukces", "note": "Bardzo zainteresowany"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        call.refresh_from_db()
        self.assertEqual(call.status, "Sukces")
        self.assertIsNotNone(call.handled_at)
        self.assertIsNotNone(call.lead)
        self.assertEqual(call.lead.status, "converted")

    def test_patch_status_oddzwonic_creates_lead_callback(self):
        call = self._make_call(phone="+48600000002")
        resp = self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Oddzwonić"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        call.refresh_from_db()
        self.assertIsNotNone(call.lead)
        self.assertEqual(call.lead.status, "callback")

    def test_patch_status_pomylka_no_lead(self):
        call = self._make_call(phone="+48600000003")
        resp = self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Pomyłka"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        call.refresh_from_db()
        self.assertIsNone(call.lead)
        self.assertIsNone(call.customer)

    def test_patch_status_nie_zainteresowany_no_lead(self):
        call = self._make_call(phone="+48600000004")
        resp = self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Nie zainteresowany"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        call.refresh_from_db()
        self.assertIsNone(call.lead)

    def test_patch_updates_existing_lead_status(self):
        lead = Lead.objects.create(
            tenant=self.tenant,
            first_name="Ewa",
            phone_number="600000005",
            status="new",
        )
        call = self._make_call(phone="600000005", lead=lead)
        resp = self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Oddzwonić"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        lead.refresh_from_db()
        self.assertEqual(lead.status, "callback")
        self.assertEqual(Lead.objects.filter(tenant=self.tenant).count(), 1)

    def test_patch_customer_no_lead_created(self):
        customer = Customer.objects.create(
            tenant=self.tenant,
            first_name="Marek",
            phone_number="600000006",
        )
        call = self._make_call(phone="600000006", customer=customer)
        resp = self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Sukces"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Lead.objects.filter(tenant=self.tenant).count(), 0)

    def test_patch_note_saved_to_call_and_lead(self):
        call = self._make_call(phone="+48600000007")
        resp = self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Oddzwonić", "note": "Zadzwonić po 15:00"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        call.refresh_from_db()
        self.assertIn("Zadzwonić po 15:00", call.notes)
        self.assertIn("Zadzwonić po 15:00", call.lead.notes)

    def test_patch_note_appended_to_existing_lead_notes(self):
        lead = Lead.objects.create(
            tenant=self.tenant,
            first_name="Zofia",
            phone_number="600000008",
            status="new",
            notes="Stara notatka",
        )
        call = self._make_call(phone="600000008", lead=lead)
        self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Sukces", "note": "Nowa notatka"},
            format="json",
        )
        lead.refresh_from_db()
        self.assertIn("Stara notatka", lead.notes)
        self.assertIn("Nowa notatka", lead.notes)

    def test_patch_unknown_call_returns_404(self):
        resp = self.client.patch(
            "/api/calls/99999/",
            {"duration": 10},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_patch_sets_handled_at_only_with_status(self):
        call = self._make_call(phone="+48600000009")
        self.client.patch(
            f"/api/calls/{call.id}/",
            {"duration": 30},
            format="json",
        )
        call.refresh_from_db()
        self.assertIsNone(call.handled_at)

        self.client.patch(
            f"/api/calls/{call.id}/",
            {"status": "Sukces"},
            format="json",
        )
        call.refresh_from_db()
        self.assertIsNotNone(call.handled_at)
