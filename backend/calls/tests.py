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
