"""API tests for the guided work-item process (flag-gated).

Covers the two things most likely to break in this slice:
  * the **flag gate** — every guided route must be invisible (404) to a tenant
    that hasn't opted in, so the legacy status flow is unaffected, and
  * the **handoff loop** — advance → lands Pending in the next person's queue →
    they claim it → pause bounces to the Owner → resolve returns it.

Run: `python manage.py test tasks.test_process_api`
"""
from io import StringIO

from django.contrib.auth.models import Permission
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import (
    Address, CustomField, PicklistValue, Role, RolePermission, Setting, User, UserRole,
)
from customers.models import Customer
from service.models import Employee, Location, RepairShop
from tenants.models import Tenant

from . import process_service
from .models import (
    CheckpointField, Notification, ProcessTemplate, StageDefinition,
    StageOutcome, StageTransition, WorkItem, WorkItemPause,
)

PERMISSIONS = ['view_all_workitems', 'change_workitem', 'add_workitem']


def _grant(user, tenant, name):
    role = Role.objects.create(name=name, tenant=tenant)
    for codename in PERMISSIONS:
        perm = Permission.objects.filter(codename=codename).first()
        if perm:
            RolePermission.objects.create(role=role, permission=perm)
    UserRole.objects.create(user=user, role=role)
    return role


class GuidedProcessAPITestCase(TestCase):
    """A tenant with an Owner + a Technician and a 3-stage process."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Guided", subdomain="guided")
        cls.other_tenant = Tenant.objects.create(name="Other", subdomain="other")

        address = Address.objects.create(
            street="Main", building_number="1", city="City", postal_code="00-001")
        shop = RepairShop.objects.create(
            tenant=cls.tenant, name="Shop", type="internal", address=address)
        cls.location = Location.objects.create(
            tenant=cls.tenant, name="Bench", type="shop", shop=shop)

        cls.owner_user = User.objects.create_user(
            username="owner@example.com", email="owner@example.com",
            password="pw", tenant=cls.tenant, first_name="Ola", last_name="Owner")
        cls.tech_user = User.objects.create_user(
            username="tech@example.com", email="tech@example.com",
            password="pw", tenant=cls.tenant, first_name="Tom", last_name="Tech")
        _grant(cls.owner_user, cls.tenant, "Owners")
        _grant(cls.tech_user, cls.tenant, "Techs")

        cls.owner = Employee.objects.create(
            tenant=cls.tenant, user=cls.owner_user, role="owner", location=cls.location)
        cls.tech = Employee.objects.create(
            tenant=cls.tenant, user=cls.tech_user, role="technician", location=cls.location)

        cls.customer = Customer.objects.create(
            tenant=cls.tenant, first_name="Cust", last_name="One", phone_number="600000001")

        # Tenant provisioning seeds the standard statuses; make sure the ones
        # this process dual-writes exist regardless.
        for value in ("New", "In Progress", "Resolved"):
            PicklistValue.objects.get_or_create(
                tenant=cls.tenant, category="workitem_status", value=value,
                defaults={"name": value, "is_active": True})
        # `skip_when` is validated against these, so a stage can't be
        # configured to skip on a repair type the tenant doesn't have.
        for value in ("Chargeable Repair", "Warranty Repair"):
            PicklistValue.objects.get_or_create(
                tenant=cls.tenant, category="workitem_type", value=value,
                defaults={"name": value, "is_active": True})

        # A cut-down reference process: New (owner) → Diagnosis (tech) → Closed.
        cls.process = ProcessTemplate.objects.create(
            tenant=cls.tenant, name="Default repair process", is_default=True)
        cls.stage_new = StageDefinition.objects.create(
            process=cls.process, key="new", name="New", owner_role="owner",
            status_value="New", order=0)
        cls.stage_diag = StageDefinition.objects.create(
            process=cls.process, key="diagnosis", name="Diagnosis",
            owner_role="technician", status_value="In Progress", order=1)
        cls.stage_closed = StageDefinition.objects.create(
            process=cls.process, key="closed", name="Closed", owner_role="any",
            status_value="Resolved", order=2)

        cls.to_diag = StageOutcome.objects.create(
            stage=cls.stage_new, kind="advance", label="Send to diagnosis",
            target_stage=cls.stage_diag, order=0)
        cls.diag_done = StageOutcome.objects.create(
            stage=cls.stage_diag, kind="advance", label="Diagnosis done",
            target_stage=cls.stage_closed, order=0)
        cls.diag_pause = StageOutcome.objects.create(
            stage=cls.stage_diag, kind="pause", label="Missing accessory",
            waiting_on="customer", reassign_to_owner=True,
            resolve_label="Customer brought it", order=1)
        # Jumps New straight to Closed, skipping Diagnosis — the shape the
        # route tests below are about.
        cls.new_exit = StageOutcome.objects.create(
            stage=cls.stage_new, kind="exit", label="Declined — dispose",
            target_stage=cls.stage_closed, order=1)

        # New's checkpoint: assigning a technician is what makes the handoff.
        CheckpointField.objects.create(
            stage=cls.stage_new, standard_key="technician", required=True, order=0)
        cls.fault_field = CustomField.objects.create(
            tenant=cls.tenant, model_name="workitem", label="Fault found",
            field_key="fault_found", field_type="text")
        CheckpointField.objects.create(
            stage=cls.stage_diag, custom_field=cls.fault_field, required=False, order=0)

    def setUp(self):
        self.work_item = WorkItem.objects.create(
            tenant=self.tenant, customer=self.customer, description="Cracked screen",
            owner=self.owner, dropoff_point=self.location, status="New")

    # ── helpers ──────────────────────────────────────────────────────

    def client_for(self, user, tenant=None):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_TENANT=(tenant or self.tenant).subdomain)
        return client

    def enable_flag(self, tenant=None):
        Setting.objects.create(
            tenant=tenant or self.tenant, key="workitem.guided_process",
            value_type="boolean", value_boolean=True)

    def url(self, suffix):
        return f"/api/tasks/work-items/{self.work_item.id}/{suffix}/"

    # ── the flag gate ────────────────────────────────────────────────

    def test_routes_are_404_when_flag_is_off(self):
        client = self.client_for(self.owner_user)
        for path in [self.url("process"), "/api/tasks/my-work/",
                     "/api/tasks/all-work-items/", "/api/tasks/notifications/"]:
            self.assertEqual(client.get(path).status_code, 404, path)
        for path in [self.url("start"), self.url("advance"),
                     self.url("pause"), self.url("resolve")]:
            self.assertEqual(client.post(path, {}, format="json").status_code, 404, path)

    def test_legacy_workitem_routes_still_work_with_flag_off(self):
        """The gate must not leak onto the CRUD routes it shares a viewset with."""
        client = self.client_for(self.owner_user)
        self.assertEqual(
            client.get(f"/api/tasks/work-items/{self.work_item.id}/").status_code, 200)

    def test_process_endpoint_returns_the_stage_path(self):
        self.enable_flag()
        resp = self.client_for(self.owner_user).get(self.url("process"))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Not started yet — but the path ahead comes from the default process,
        # so the UI can show where this repair is going to go.
        self.assertIsNone(data["current_stage"])
        self.assertEqual([s["key"] for s in data["stages"]], ["new", "diagnosis", "closed"])

    # ── the loop ─────────────────────────────────────────────────────

    def test_start_puts_the_item_on_the_first_stage(self):
        self.enable_flag()
        resp = self.client_for(self.owner_user).post(self.url("start"), {}, format="json")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["current_stage_key"], "new")
        self.assertEqual(data["progress"], "in_progress")
        self.assertEqual([s["key"] for s in data["stages"]], ["new", "diagnosis", "closed"])
        # Checkpoint metadata the panel renders from.
        checkpoint = data["stages"][0]["checkpoint_fields"][0]
        self.assertEqual(
            (checkpoint["source"], checkpoint["key"], checkpoint["type"], checkpoint["required"]),
            ("standard", "technician", "foreignkey", True))
        self.work_item.refresh_from_db()
        self.assertEqual(self.work_item.status, "New")  # dual-write

    def test_a_picklist_backed_checkpoint_field_carries_its_options(self):
        """Every picklist-backed column, not just status — without options the
        panel falls back to a free-text box."""
        self.enable_flag()
        PicklistValue.objects.get_or_create(
            tenant=self.tenant, category="payment_method", value="Blik",
            defaults={"name": "BLIK", "is_active": True})
        CheckpointField.objects.create(
            stage=self.stage_new, standard_key="payment_method", order=1)

        resp = self.client_for(self.owner_user).get(self.url("process"))
        field = next(f for f in resp.json()["stages"][0]["checkpoint_fields"]
                     if f["key"] == "payment_method")
        self.assertIn(["Blik", "BLIK"], field["config"]["choices"])

    def test_advance_requires_the_required_checkpoint_field(self):
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        resp = client.post(self.url("advance"), {"outcome_id": self.to_diag.id}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("technician", str(resp.json()))
        self.work_item.refresh_from_db()
        self.assertEqual(self.work_item.current_stage_id, self.stage_new.id)

    def test_advance_applies_captured_values_and_hands_off(self):
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        resp = client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id},
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.json())
        data = resp.json()
        self.assertEqual(data["current_stage_key"], "diagnosis")
        # Different person now owns the stage → Pending until they claim it.
        self.assertEqual(data["progress"], "pending")
        self.assertEqual(data["responsible"]["id"], self.tech.id)

        self.work_item.refresh_from_db()
        self.assertEqual(self.work_item.technician_id, self.tech.id)
        self.assertEqual(self.work_item.status, "In Progress")  # dual-write
        self.assertTrue(
            Notification.objects.filter(recipient=self.tech, type="handoff").exists())

    def test_advance_rejects_values_that_are_not_checkpoint_fields(self):
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        resp = client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id, "final_price": "999"},
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("final_price", str(resp.json()))

    def test_advance_rejects_an_outcome_from_another_stage(self):
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        resp = client.post(self.url("advance"),
                           {"outcome_id": self.diag_done.id}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_custom_field_capture_merges_into_custom_fields(self):
        self.enable_flag()
        self._hand_to_technician()
        tech_client = self.client_for(self.tech_user)
        resp = tech_client.post(self.url("advance"), {
            "outcome_id": self.diag_done.id,
            "captured_values": {"fault_found": "Broken digitizer"},
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.json())
        self.work_item.refresh_from_db()
        self.assertEqual(self.work_item.custom_fields["fault_found"], "Broken digitizer")
        self.assertEqual(self.work_item.current_stage_id, self.stage_closed.id)

    def test_the_note_lands_on_the_transition(self):
        """The note is the checkpoint's default capture (§3) — if it doesn't
        reach the trail, the whole note-first premise is broken."""
        self.enable_flag()
        self._hand_to_technician()
        resp = self.client_for(self.tech_user).post(self.url("advance"), {
            "outcome_id": self.diag_done.id,
            "note": "Digitizer cracked, frame intact.",
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.json())
        latest = resp.json()["transitions"][0]
        self.assertEqual(latest["note"], "Digitizer cracked, frame intact.")

    def test_a_note_free_advance_still_records_the_outcome(self):
        """Without a note the trail falls back to the outcome's label, so an
        entry is never blank."""
        self.enable_flag()
        self._hand_to_technician()
        resp = self.client_for(self.tech_user).post(
            self.url("advance"), {"outcome_id": self.diag_done.id}, format="json")
        self.assertEqual(resp.json()["transitions"][0]["note"], "Diagnosis done")

    # ── recap ────────────────────────────────────────────────────────

    def recap_for(self, user):
        return self.client_for(user).get(self.url("process")).json()["recap"]

    def test_recap_shows_what_the_earlier_stage_captured(self):
        """Quote-shows-the-diagnosis (§7), on the cut-down process: Diagnosis
        shows what New captured plus how New was signed off."""
        self.stage_diag.recap_sources = ["new"]
        self.stage_diag.save(update_fields=["recap_sources"])
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id},
            "note": "Customer says it freezes when charging.",
        }, format="json")

        recap = self.recap_for(self.tech_user)
        self.assertEqual([r["key"] for r in recap], ["new.technician", "new.note"])
        tech_row, note_row = recap
        self.assertEqual(tech_row["value"]["id"], self.tech.id)
        self.assertEqual(tech_row["type"], "foreignkey")
        self.assertEqual(note_row["label"], "New notes")
        self.assertEqual(note_row["value"], "Customer says it freezes when charging.")

    def test_recap_can_reference_a_single_field(self):
        """Repair recaps the findings but not the effort estimate — the whole
        point of addressing one field rather than the whole stage."""
        self.stage_diag.recap_sources = ["new.technician"]
        self.stage_diag.save(update_fields=["recap_sources"])
        self.enable_flag()
        self._hand_to_technician()
        self.assertEqual([r["key"] for r in self.recap_for(self.tech_user)],
                         ["new.technician"])

    def test_recap_can_show_a_field_from_the_work_item_itself(self):
        """Intake data — the fault as the customer reported it — reaches the
        checkpoint even though no stage captured it (§7)."""
        self.stage_diag.recap_sources = ["item.description", "new.technician"]
        self.stage_diag.save(update_fields=["recap_sources"])
        self.enable_flag()
        self._hand_to_technician()

        recap = self.recap_for(self.tech_user)
        self.assertEqual([r["key"] for r in recap],
                         ["item.description", "new.technician"])
        self.assertEqual(recap[0]["label"], "Reported issue")
        self.assertEqual(recap[0]["value"], self.work_item.description)

    def test_a_blank_work_item_field_is_left_out_of_the_recap(self):
        """Same rule as a captured field: no row rather than an empty one."""
        self.stage_diag.recap_sources = ["item.device_condition"]
        self.stage_diag.save(update_fields=["recap_sources"])
        self.enable_flag()
        self._hand_to_technician()
        self.assertEqual(self.recap_for(self.tech_user), [])

    def test_recap_drops_values_that_were_never_captured(self):
        """An uncaptured field is left out, not rendered as a blank row — a
        card full of dashes is worse than no card (§11 "hidden when empty")."""
        self.stage_closed.recap_sources = ["diagnosis"]
        self.stage_closed.save(update_fields=["recap_sources"])
        self.enable_flag()
        self._hand_to_technician()
        # Leave Diagnosis without filling in its optional custom field.
        self.client_for(self.tech_user).post(
            self.url("advance"), {"outcome_id": self.diag_done.id}, format="json")

        keys = [r["key"] for r in self.recap_for(self.tech_user)]
        self.assertNotIn("diagnosis.fault_found", keys)
        self.assertEqual(keys, ["diagnosis.note"])

    def test_recap_is_empty_before_the_source_stage_has_run(self):
        self.stage_new.recap_sources = []
        self.enable_flag()
        self.client_for(self.owner_user).post(self.url("start"), {}, format="json")
        self.assertEqual(self.recap_for(self.owner_user), [])

    def test_a_bad_recap_source_is_rejected_at_edit_time(self):
        """The config UI is Django admin for the pilot, so a typo has to fail
        loudly — otherwise it renders as an empty card and looks like the
        repair simply hasn't got there yet."""
        for bad in (["nosuchstage"], ["closed"], ["diagnosis.not_a_field"],
                    ["item"], ["item.not_a_column"]):
            self.stage_diag.recap_sources = bad
            with self.assertRaises(ValidationError, msg=bad) as ctx:
                self.stage_diag.full_clean()
            self.assertIn("recap_sources", ctx.exception.message_dict)

    def test_stray_spaces_in_a_recap_source_are_forgiven(self):
        self.stage_diag.recap_sources = ["item. description", " new .technician"]
        self.stage_diag.full_clean()
        self.assertEqual(self.stage_diag.recap_sources, ["item.description", "new.technician"])

    def test_a_recap_source_saved_with_spaces_still_renders(self):
        self.stage_diag.recap_sources = ["item. description"]
        self.stage_diag.save(update_fields=["recap_sources"])
        self.enable_flag()
        self._hand_to_technician()
        recap = self.recap_for(self.tech_user)
        self.assertEqual(recap[0]["value"], self.work_item.description)

    def test_pause_bounces_to_owner_and_resolve_returns_it(self):
        self.enable_flag()
        self._hand_to_technician()
        tech_client = self.client_for(self.tech_user)
        tech_client.post(self.url("start"), {}, format="json")

        resp = tech_client.post(self.url("pause"),
                                {"outcome_id": self.diag_pause.id}, format="json")
        self.assertEqual(resp.status_code, 200, resp.json())
        data = resp.json()
        self.assertEqual(data["state"], "waiting")
        self.assertTrue(data["pause"]["reassigned"])
        self.assertEqual(data["responsible"]["id"], self.owner.id)
        self.assertTrue(
            Notification.objects.filter(recipient=self.owner, type="bounce").exists())

        resp = self.client_for(self.owner_user).post(
            self.url("resolve"), {"note": "Customer is bringing the charger."},
            format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["pause"])
        self.assertEqual(resp.json()["transitions"][0]["note"],
                         "Customer is bringing the charger.")
        self.assertEqual(resp.json()["responsible"]["id"], self.tech.id)
        self.assertFalse(WorkItemPause.objects.filter(work_item=self.work_item).exists())
        self.assertTrue(
            Notification.objects.filter(recipient=self.tech, type="resolved").exists())

    # ── going back ───────────────────────────────────────────────────

    def test_move_back_to_an_earlier_stage(self):
        """Something was missed: send the repair back, without having to
        satisfy the checkpoint you're abandoning."""
        self.enable_flag()
        self._hand_to_technician()

        resp = self.client_for(self.tech_user).post(self.url("advance"), {
            "target_stage_id": self.stage_new.id,
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.json())
        data = resp.json()
        self.assertEqual(data["current_stage_key"], "new")
        # Recorded as a correction, not as progress.
        self.assertEqual(data["transitions"][0]["kind"], "back")
        self.work_item.refresh_from_db()
        self.assertEqual(self.work_item.status, "New")  # dual-write follows

    def test_move_back_re_routes_to_that_stages_owner(self):
        self.enable_flag()
        self._hand_to_technician()
        Notification.objects.all().delete()

        data = self.client_for(self.tech_user).post(self.url("advance"), {
            "target_stage_id": self.stage_new.id,
        }, format="json").json()
        # New is the Owner's stage, so it lands back on their plate as Pending.
        self.assertEqual(data["responsible"]["id"], self.owner.id)
        self.assertEqual(data["progress"], "pending")
        self.assertTrue(
            Notification.objects.filter(recipient=self.owner, type="handoff").exists())

    def test_moving_back_out_of_a_closed_stage_reopens_the_item(self):
        self.enable_flag()
        self._hand_to_technician()
        client = self.client_for(self.tech_user)
        client.post(self.url("advance"), {"outcome_id": self.diag_done.id}, format="json")
        self.work_item.refresh_from_db()
        self.assertEqual(self.work_item.current_stage_id, self.stage_closed.id)
        self.assertIsNotNone(self.work_item.closed_date)

        client.post(self.url("advance"), {"target_stage_id": self.stage_diag.id}, format="json")
        self.work_item.refresh_from_db()
        self.assertEqual(self.work_item.current_stage_id, self.stage_diag.id)
        self.assertIsNone(self.work_item.closed_date, "reopening must clear closed_date")

    def test_a_terminal_stage_reports_done_not_in_progress(self):
        self.enable_flag()
        self._hand_to_technician()
        data = self.client_for(self.tech_user).post(
            self.url("advance"), {"outcome_id": self.diag_done.id}, format="json").json()

        self.assertEqual(data["current_stage_key"], "closed")
        self.assertEqual(data["state"], "done")
        closed = [s for s in data["stages"] if s["key"] == "closed"][0]
        self.assertTrue(closed["is_terminal"])
        self.assertFalse([s for s in data["stages"] if s["key"] == "new"][0]["is_terminal"])

        # …and the oversight list agrees, so a closed repair doesn't read as
        # active work there either.
        row = self.client_for(self.owner_user).get("/api/tasks/all-work-items/").json()[0]
        self.assertEqual(row["state"], "done")

    def test_cannot_target_a_stage_from_another_process(self):
        self.enable_flag()
        other_process = ProcessTemplate.objects.create(tenant=self.tenant, name="Other")
        foreign = StageDefinition.objects.create(
            process=other_process, key="new", name="New", owner_role="owner", order=0)
        self._hand_to_technician()

        resp = self.client_for(self.tech_user).post(self.url("advance"), {
            "target_stage_id": foreign.id,
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("different process", str(resp.json()))

    # ── the route an exit leaves behind ──────────────────────────────

    def take_the_exit(self, note=None):
        """Leave New by the Exit, jumping over Diagnosis to Closed."""
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        body = {"outcome_id": self.new_exit.id,
                "captured_values": {"technician": self.tech.id}}
        if note is not None:
            body["note"] = note
        return client.post(self.url("advance"), body, format="json")

    def test_an_exit_records_which_outcome_was_taken(self):
        """`kind` alone can't tell declined-return from declined-dispose, and
        `note` is gone the moment someone types a reason instead."""
        latest = self.take_the_exit(note="Not worth repairing").json()["transitions"][0]
        self.assertEqual(latest["kind"], "exit")
        self.assertEqual(latest["outcome_label"], "Declined — dispose")
        self.assertEqual(latest["note"], "Not worth repairing")
        self.assertEqual(
            StageTransition.objects.filter(kind="exit").first().outcome_id,
            self.new_exit.id)

    def test_the_route_names_the_exit_and_what_it_skipped(self):
        """The point of the whole thing: Closed has to say the repair never
        happened, and Diagnosis was jumped over rather than completed."""
        data = self.take_the_exit(note="Not worth repairing").json()
        route = data["route"]
        self.assertEqual(route["label"], "Declined — dispose")
        self.assertEqual(route["note"], "Not worth repairing")
        self.assertEqual(route["from_stage_name"], "New")
        self.assertEqual(route["to_stage_name"], "Closed")
        self.assertEqual([s["key"] for s in route["skipped"]], ["diagnosis"])
        self.assertEqual(route["by"], "Ola Owner")

    def test_a_note_free_exit_still_names_the_outcome(self):
        """Nothing typed: the label carries it, and `note` isn't echoed back as
        a duplicate of the label it fell back to."""
        route = self.take_the_exit().json()["route"]
        self.assertEqual(route["label"], "Declined — dispose")
        self.assertIsNone(route["note"])

    def test_a_normal_advance_leaves_no_route(self):
        self.enable_flag()
        self._hand_to_technician()
        data = self.client_for(self.tech_user).post(
            self.url("advance"), {"outcome_id": self.diag_done.id}, format="json").json()
        self.assertEqual(data["current_stage_key"], "closed")
        self.assertIsNone(data["route"])

    def test_the_route_survives_later_stages(self):
        """A decline still describes the repair two stages later — otherwise
        the next person sees a clean history again."""
        self.take_the_exit()
        # Reopen to Diagnosis, then run it forward the normal way. The exit is
        # still the reason this repair is where it is.
        client = self.client_for(self.owner_user)
        client.post(self.url("advance"),
                    {"target_stage_id": self.stage_diag.id}, format="json")
        data = self.client_for(self.tech_user).post(
            self.url("advance"), {"outcome_id": self.diag_done.id}, format="json").json()
        self.assertEqual(data["current_stage_key"], "closed")
        self.assertEqual(data["route"]["label"], "Declined — dispose")

    def test_going_back_past_a_jump_also_clears_the_skip_marks(self):
        """Regression: the route cleared but the stepper kept Diagnosis struck
        through, on a repair that was back before the jump and would go
        through it again."""
        self.take_the_exit()
        self.assertEqual(
            [s["key"] for s in
             self.client_for(self.owner_user).get(self.url("process")).json()["skipped"]],
            ["diagnosis"])

        data = self.client_for(self.owner_user).post(
            self.url("advance"), {"target_stage_id": self.stage_new.id},
            format="json").json()
        self.assertEqual(data["current_stage_key"], "new")
        self.assertEqual(data["skipped"], [])

    def test_going_back_past_the_exit_clears_the_route(self):
        """Rewinding to the stage the exit left from means it's being redone —
        it no longer describes where the repair is."""
        self.take_the_exit()
        data = self.client_for(self.owner_user).post(
            self.url("advance"), {"target_stage_id": self.stage_new.id},
            format="json").json()
        self.assertEqual(data["current_stage_key"], "new")
        self.assertIsNone(data["route"])

    def test_a_stage_visited_after_the_exit_is_not_reported_as_skipped(self):
        self.take_the_exit()
        client = self.client_for(self.owner_user)
        client.post(self.url("advance"),
                    {"target_stage_id": self.stage_diag.id}, format="json")
        data = self.client_for(self.tech_user).post(
            self.url("advance"), {"outcome_id": self.diag_done.id}, format="json").json()
        self.assertEqual(data["route"]["skipped"], [])

    # ── stages that don't apply to a repair ──────────────────────────

    def make_diagnosis_skippable(self, *types):
        self.stage_diag.skip_when = [{"field": "type", "in": list(types)}]
        self.stage_diag.save(update_fields=["skip_when"])

    def test_a_stage_that_does_not_apply_is_passed_over(self):
        """§8's warranty variant: nothing to quote on a warranty job, so the
        advance lands on the stage after it."""
        self.make_diagnosis_skippable("Warranty Repair")
        self.work_item.type = "Warranty Repair"
        self.work_item.save(update_fields=["type"])
        self.enable_flag()

        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        data = client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id},
        }, format="json").json()

        self.assertEqual(data["current_stage_key"], "closed")
        self.assertEqual([s["key"] for s in data["skipped"]], ["diagnosis"])
        self.assertEqual(data["skipped"][0]["reason"], "not_applicable")

    def test_the_same_stage_is_not_skipped_for_other_repair_types(self):
        self.make_diagnosis_skippable("Warranty Repair")
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        data = client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id},
        }, format="json").json()

        self.assertEqual(data["current_stage_key"], "diagnosis")
        self.assertEqual(data["skipped"], [])

    def test_a_skip_never_falls_off_the_end_of_the_process(self):
        """Everything ahead skippable must still leave the repair somewhere."""
        self.make_diagnosis_skippable("Warranty Repair")
        self.stage_closed.skip_when = [{"field": "type", "in": ["Warranty Repair"]}]
        self.stage_closed.save(update_fields=["skip_when"])
        self.work_item.type = "Warranty Repair"
        self.work_item.save(update_fields=["type"])
        self.enable_flag()

        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        data = client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id},
        }, format="json").json()
        self.assertEqual(data["current_stage_key"], "closed")

    def test_moving_back_ignores_the_skip_rules(self):
        """An explicit target is a deliberate correction — being bounced
        forward again would make a skipped stage impossible to return to."""
        self.make_diagnosis_skippable("Warranty Repair")
        self.work_item.type = "Warranty Repair"
        self.work_item.save(update_fields=["type"])
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id},
        }, format="json")

        data = client.post(self.url("advance"), {
            "target_stage_id": self.stage_diag.id}, format="json").json()
        self.assertEqual(data["current_stage_key"], "diagnosis")
        self.assertEqual(data["skipped"], [], "visiting it clears the skip")

    def test_a_backfilled_repair_does_not_report_earlier_stages_as_skipped(self):
        """It never visited them, but it didn't skip them either — it predates
        the guided flow, and striking them through would be a fresh lie."""
        self.enable_flag()
        self.work_item.current_stage = self.stage_closed
        self.work_item.progress = "in_progress"
        self.work_item.save(update_fields=["current_stage", "progress"])
        StageTransition.objects.create(
            work_item=self.work_item, from_stage=None, to_stage=self.stage_closed,
            kind="start")

        data = self.client_for(self.owner_user).get(self.url("process")).json()
        self.assertEqual(data["skipped"], [])

    def outcome_on(self, data, stage_key, label):
        stage = [s for s in data["stages"] if s["key"] == stage_key][0]
        return [o for o in stage["outcomes"] if o["label"] == label][0]

    def test_an_outcome_names_the_stage_it_really_lands_on(self):
        """The button says what you're doing; the app says where it goes. With
        Diagnosis skipped, "Send to diagnosis" must not still promise it."""
        self.make_diagnosis_skippable("Warranty Repair")
        self.work_item.type = "Warranty Repair"
        self.work_item.save(update_fields=["type"])
        self.enable_flag()

        data = self.client_for(self.owner_user).get(self.url("process")).json()
        outcome = self.outcome_on(data, "new", "Send to diagnosis")
        self.assertEqual(outcome["target_stage_key"], "diagnosis")
        self.assertEqual(outcome["effective_target_stage_key"], "closed")
        self.assertEqual(outcome["effective_target_stage_name"], "Closed")

    def test_an_outcome_keeps_its_own_target_when_nothing_is_skipped(self):
        self.make_diagnosis_skippable("Warranty Repair")
        self.enable_flag()
        data = self.client_for(self.owner_user).get(self.url("process")).json()
        outcome = self.outcome_on(data, "new", "Send to diagnosis")
        self.assertEqual(outcome["effective_target_stage_key"], "diagnosis")

    def test_a_stage_visited_on_an_earlier_pass_is_still_skipped_on_a_later_one(self):
        """Regression: a repair that was sent back and re-run passed over the
        stage the second time, but the stepper still gave it a green check
        because it had been entered once, before the correction."""
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id},
        }, format="json")
        client.post(self.url("advance"),
                    {"target_stage_id": self.stage_new.id}, format="json")

        # Now it's a warranty job, so the re-run passes over Diagnosis.
        self.make_diagnosis_skippable("Warranty Repair")
        self.work_item.type = "Warranty Repair"
        self.work_item.save(update_fields=["type"])

        data = client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id}, format="json").json()
        self.assertEqual(data["current_stage_key"], "closed")
        self.assertEqual([s["key"] for s in data["skipped"]], ["diagnosis"])

    def test_a_mistyped_repair_type_is_rejected_at_edit_time(self):
        self.stage_diag.skip_when = [{"field": "type", "in": ["Warrantee Repair"]}]
        with self.assertRaises(ValidationError) as ctx:
            self.stage_diag.full_clean()
        self.assertIn("skip_when", ctx.exception.message_dict)

    # ── stages skipped by what an earlier checkpoint captured ────────

    def skip_diagnosis_on_checkbox(self, **condition):
        """A checkbox captured at New, and Diagnosis set to skip on it — the
        shape of "repaired during diagnosis skips Repair": the value is
        captured at one stage and decides whether the *next* one runs."""
        field = CustomField.objects.create(
            tenant=self.tenant, model_name="workitem", label="Already sorted",
            field_key="already_sorted", field_type="checkbox")
        CheckpointField.objects.create(
            stage=self.stage_new, custom_field=field, required=False, order=1)
        self.stage_diag.skip_when = [dict(
            field="already_sorted", label="Already sorted on the bench", **condition)]
        self.stage_diag.save(update_fields=["skip_when"])
        return field

    def advance_out_of_new(self, captured):
        self.enable_flag()
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        return client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id, "captured_values": captured,
        }, format="json").json()

    def test_a_checkbox_ticked_at_the_previous_checkpoint_skips_the_stage(self):
        """The whole point: captured values are persisted before the advance
        resolves its target, so ticking the box routes this same move."""
        self.skip_diagnosis_on_checkbox(equals=True)
        data = self.advance_out_of_new(
            {"technician": self.tech.id, "already_sorted": True})

        self.assertEqual(data["current_stage_key"], "closed")
        self.assertEqual([s["key"] for s in data["skipped"]], ["diagnosis"])

    def test_the_skip_reason_names_the_rule_that_fired(self):
        self.skip_diagnosis_on_checkbox(equals=True)
        data = self.advance_out_of_new(
            {"technician": self.tech.id, "already_sorted": True})

        self.assertEqual(data["skipped"][0]["reason"], "not_applicable")
        self.assertEqual(data["skipped"][0]["reason_label"],
                         "Already sorted on the bench")

    def test_an_unticked_checkbox_leaves_the_stage_in_the_path(self):
        self.skip_diagnosis_on_checkbox(equals=True)
        data = self.advance_out_of_new({"technician": self.tech.id})

        self.assertEqual(data["current_stage_key"], "diagnosis")
        self.assertEqual(data["skipped"], [])

    def test_a_checkbox_sent_as_a_string_still_routes(self):
        """Custom field values are free-form JSON, so the same tick arrives as
        True, "true" or 1 depending on the client."""
        self.skip_diagnosis_on_checkbox(equals=True)
        data = self.advance_out_of_new(
            {"technician": self.tech.id, "already_sorted": "true"})

        self.assertEqual(data["current_stage_key"], "closed")

    def test_a_checkbox_sent_as_the_string_false_does_not_route(self):
        self.skip_diagnosis_on_checkbox(equals=True)
        data = self.advance_out_of_new(
            {"technician": self.tech.id, "already_sorted": "false"})

        self.assertEqual(data["current_stage_key"], "diagnosis")

    def test_the_outcome_button_names_where_it_really_lands(self):
        """The label says the action; the app has to say the destination, and
        a value-driven skip moves it just as a type-driven one does."""
        self.skip_diagnosis_on_checkbox(equals=True)
        self.work_item.custom_fields = {"already_sorted": True}
        self.work_item.save(update_fields=["custom_fields"])
        self.enable_flag()

        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        stages = {s["key"]: s for s in client.get(self.url("process")).json()["stages"]}
        outcome = stages["new"]["outcomes"][0]

        self.assertEqual(outcome["target_stage_key"], "diagnosis")
        self.assertEqual(outcome["effective_target_stage_key"], "closed")

    def test_a_skipped_stage_can_still_be_done_after_all(self):
        """The correction path bypasses skip rules by design — a stage passed
        over is still reachable when it turns out it was needed."""
        self.skip_diagnosis_on_checkbox(equals=True)
        self.advance_out_of_new({"technician": self.tech.id, "already_sorted": True})

        data = self.client_for(self.owner_user).post(self.url("advance"), {
            "target_stage_id": self.stage_diag.id}, format="json").json()

        self.assertEqual(data["current_stage_key"], "diagnosis")

    def test_a_skip_can_match_a_standard_column_with_equals(self):
        self.stage_diag.skip_when = [{"field": "type", "equals": "Warranty Repair"}]
        self.stage_diag.save(update_fields=["skip_when"])
        self.work_item.type = "Warranty Repair"
        self.work_item.save(update_fields=["type"])

        data = self.advance_out_of_new({"technician": self.tech.id})
        self.assertEqual(data["current_stage_key"], "closed")

    def test_a_rule_naming_a_field_that_does_not_exist_is_rejected(self):
        self.stage_diag.skip_when = [{"field": "repaired_on_the_moon", "equals": True}]
        with self.assertRaises(ValidationError) as ctx:
            self.stage_diag.full_clean()
        self.assertIn("skip_when", ctx.exception.message_dict)

    def test_a_rule_without_exactly_one_operator_is_rejected(self):
        for condition in ({"field": "type"},
                          {"field": "type", "equals": "Warranty Repair",
                           "in": ["Warranty Repair"]}):
            self.stage_diag.skip_when = [condition]
            with self.assertRaises(ValidationError) as ctx:
                self.stage_diag.full_clean()
            self.assertIn("skip_when", ctx.exception.message_dict)

    def test_a_custom_field_the_tenant_has_is_accepted_at_edit_time(self):
        self.stage_diag.skip_when = [{"field": "fault_found", "equals": "none"}]
        self.stage_diag.full_clean()

    # ── queues ───────────────────────────────────────────────────────

    def test_my_work_follows_the_responsible_person(self):
        self.enable_flag()
        self._hand_to_technician()

        tech_queue = self.client_for(self.tech_user).get("/api/tasks/my-work/").json()
        self.assertEqual([i["id"] for i in tech_queue["to_start"]], [self.work_item.id])
        self.assertEqual(tech_queue["in_progress"], [])

        # It left the owner's plate the moment it was handed over.
        owner_queue = self.client_for(self.owner_user).get("/api/tasks/my-work/").json()
        self.assertEqual(owner_queue["to_start"], [])
        self.assertEqual(owner_queue["in_progress"], [])

        self.client_for(self.tech_user).post(self.url("start"), {}, format="json")
        tech_queue = self.client_for(self.tech_user).get("/api/tasks/my-work/").json()
        self.assertEqual(tech_queue["to_start"], [])
        self.assertEqual([i["id"] for i in tech_queue["in_progress"]], [self.work_item.id])

    def test_bounced_pause_moves_the_item_to_the_owners_waiting_section(self):
        self.enable_flag()
        self._hand_to_technician()
        tech_client = self.client_for(self.tech_user)
        tech_client.post(self.url("start"), {}, format="json")
        tech_client.post(self.url("pause"), {"outcome_id": self.diag_pause.id}, format="json")

        owner_queue = self.client_for(self.owner_user).get("/api/tasks/my-work/").json()
        self.assertEqual([i["id"] for i in owner_queue["waiting"]], [self.work_item.id])
        tech_queue = self.client_for(self.tech_user).get("/api/tasks/my-work/").json()
        self.assertEqual(tech_queue["waiting"], [])
        self.assertEqual(tech_queue["in_progress"], [])

    def test_all_work_items_lists_the_stage_and_who_holds_it(self):
        self.enable_flag()
        self._hand_to_technician()
        resp = self.client_for(self.owner_user).get("/api/tasks/all-work-items/")
        self.assertEqual(resp.status_code, 200)
        row = resp.json()[0]
        self.assertEqual(row["stage"]["key"], "diagnosis")
        self.assertEqual(row["state"], "pending")
        self.assertEqual(row["responsible"]["id"], self.tech.id)
        self.assertEqual(row["responsible"]["name"], "Tom Tech")
        self.assertEqual(row["customer_name"], "Cust One")

    def test_person_without_a_full_name_still_renders(self):
        """Employee.__str__ is blank for accounts with no first/last name."""
        self.enable_flag()
        self.owner_user.first_name = ""
        self.owner_user.last_name = ""
        self.owner_user.save(update_fields=["first_name", "last_name"])
        resp = self.client_for(self.owner_user).post(self.url("start"), {}, format="json")
        self.assertEqual(resp.json()["responsible"]["name"], "owner@example.com")

        # …and the same fallback applies to FK checkpoint values, which are
        # rendered as read-only text when peeking at a finished stage.
        self.work_item.technician = self.owner
        self.work_item.save(update_fields=["technician"])
        data = self.client_for(self.owner_user).get(self.url("process")).json()
        technician = data["stages"][0]["checkpoint_fields"][0]
        self.assertEqual(technician["value"], {"id": self.owner.id, "label": "owner@example.com"})

    def test_queue_is_scoped_to_the_tenant(self):
        """Another tenant's employee sees their own queue, never ours."""
        self.enable_flag()
        self.enable_flag(self.other_tenant)
        self._hand_to_technician()
        other = self._build_other_tenant_work_item()

        resp = self.client_for(other["user"], tenant=self.other_tenant).get("/api/tasks/my-work/")
        self.assertEqual(resp.status_code, 200)
        ids = [
            item["id"]
            for section in ("to_start", "in_progress", "waiting")
            for item in resp.json()[section]
        ]
        self.assertEqual(ids, [other["work_item"].id])

        ours = self.client_for(self.tech_user).get("/api/tasks/my-work/").json()
        self.assertEqual([i["id"] for i in ours["to_start"]], [self.work_item.id])

    # ── notifications ────────────────────────────────────────────────

    def test_notifications_are_private_to_their_recipient(self):
        self.enable_flag()
        self._hand_to_technician()

        tech_resp = self.client_for(self.tech_user).get("/api/tasks/notifications/").json()
        self.assertEqual(tech_resp["unread_count"], 1)
        self.assertEqual(tech_resp["results"][0]["type"], "handoff")

        owner_resp = self.client_for(self.owner_user).get("/api/tasks/notifications/").json()
        self.assertEqual(owner_resp["unread_count"], 0)
        self.assertEqual(owner_resp["results"], [])

    def test_mark_notification_read(self):
        self.enable_flag()
        self._hand_to_technician()
        notification = Notification.objects.get(recipient=self.tech)
        client = self.client_for(self.tech_user)

        # Not the recipient → not even visible.
        self.assertEqual(
            self.client_for(self.owner_user).post(
                f"/api/tasks/notifications/{notification.id}/read/", {}, format="json"
            ).status_code, 404)

        resp = client.post(f"/api/tasks/notifications/{notification.id}/read/", {}, format="json")
        self.assertEqual(resp.status_code, 200)
        notification.refresh_from_db()
        self.assertTrue(notification.read)
        self.assertEqual(client.get("/api/tasks/notifications/").json()["unread_count"], 0)

    # ── shared setup step ────────────────────────────────────────────

    def _build_other_tenant_work_item(self):
        """A second tenant with its own process, employee and in-flight item."""
        tenant = self.other_tenant
        address = Address.objects.create(
            street="Other", building_number="2", city="City", postal_code="00-002")
        shop = RepairShop.objects.create(
            tenant=tenant, name="Other Shop", type="internal", address=address)
        location = Location.objects.create(
            tenant=tenant, name="Other Bench", type="shop", shop=shop)
        user = User.objects.create_user(
            username="other@example.com", email="other@example.com",
            password="pw", tenant=tenant, first_name="Oli", last_name="Other")
        _grant(user, tenant, "Other staff")
        employee = Employee.objects.create(
            tenant=tenant, user=user, role="owner", location=location)
        customer = Customer.objects.create(
            tenant=tenant, first_name="Other", last_name="Cust", phone_number="600000002")
        process = ProcessTemplate.objects.create(
            tenant=tenant, name="Other process", is_default=True)
        stage = StageDefinition.objects.create(
            process=process, key="new", name="New", owner_role="owner", order=0)
        work_item = WorkItem.objects.create(
            tenant=tenant, customer=customer, description="Other repair",
            owner=employee, dropoff_point=location, current_stage=stage,
            progress="pending")
        return {"user": user, "employee": employee, "work_item": work_item}

    def _hand_to_technician(self):
        client = self.client_for(self.owner_user)
        client.post(self.url("start"), {}, format="json")
        resp = client.post(self.url("advance"), {
            "outcome_id": self.to_diag.id,
            "captured_values": {"technician": self.tech.id},
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.json())
        self.work_item.refresh_from_db()


class SeedDefaultProcessTests(TestCase):
    """The seeded reference process (§8) — mainly a guard that the Diagnosis
    checkpoint keeps its fields. `issue_diagnosis` / `required_parts` /
    `estimated_effort` exist as columns *only* to feed the guided flow, so a
    stage that stops referencing them orphans them silently."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Seeded", subdomain="seeded")

    def seed(self):
        call_command("seed_default_process", tenant=self.tenant.subdomain,
                     stdout=StringIO())
        return ProcessTemplate.objects.get(tenant=self.tenant)

    def test_diagnosis_captures_the_findings_quote_needs(self):
        stages = {s.key: s for s in self.seed().stages.all()}
        fields = {f.standard_key: f for f in stages["diagnosis"].checkpoint_fields.all()
                  if f.standard_key}
        self.assertEqual(set(fields), {"issue_diagnosis", "required_parts", "estimated_effort"})
        # You cannot leave Diagnosis without writing down what you found.
        self.assertTrue(fields["issue_diagnosis"].required)

    def test_every_seeded_standard_key_is_a_real_workitem_column(self):
        """A typo here fails at render time, not at seed time."""
        for stage in self.seed().stages.all():
            for field in stage.checkpoint_fields.all():
                if field.standard_key:
                    WorkItem._meta.get_field(field.standard_key)

    def test_the_seeded_process_validates(self):
        """`update_or_create` skips `clean()`, so nothing else would catch a
        recap source that points at a stage or field the seed doesn't create."""
        for stage in self.seed().stages.all():
            stage.full_clean(exclude=['process'])

    def test_quote_recaps_the_diagnosis(self):
        """§8's headline recap: you cannot price a repair blind."""
        stages = {s.key: s for s in self.seed().stages.all()}
        # And you cannot confirm a reported fault you cannot see.
        self.assertEqual(stages["diagnosis"].recap_sources, ["item.description"])
        self.assertEqual(stages["quote"].recap_sources, ["diagnosis"])
        self.assertEqual(stages["repair"].recap_sources,
                         ["diagnosis.issue_diagnosis", "diagnosis.required_parts"])
        self.assertEqual(stages["handover"].recap_sources,
                         ["repair.note", "quote.estimated_price"])

    def test_a_repair_done_on_the_bench_skips_repair_but_still_gets_quoted(self):
        """§5's second skip trigger on the real reference process: the device
        was fixed during diagnosis, so there is no repair left to do — but the
        customer still has to approve and pay for it, so Quote stands."""
        stages = {s.key: s for s in self.seed().stages.all()}
        fixed_on_the_bench = WorkItem(
            tenant=self.tenant, type="Chargeable Repair",
            custom_fields={"repaired_during_diagnosis": True})

        self.assertFalse(stages["repair"].applies_to(fixed_on_the_bench))
        self.assertEqual(stages["repair"].skip_reason(fixed_on_the_bench),
                         "Repaired during diagnosis")
        self.assertTrue(stages["quote"].applies_to(fixed_on_the_bench))

        # Approving the quote lands past Repair, on Handover.
        approved = stages["quote"].outcomes.get(kind="advance")
        self.assertEqual(approved.target_stage.key, "repair")
        self.assertEqual(
            process_service.landing_stage(fixed_on_the_bench, approved.target_stage).key,
            "handover")

    def test_an_ordinary_repair_still_goes_through_the_repair_stage(self):
        stages = {s.key: s for s in self.seed().stages.all()}
        ordinary = WorkItem(tenant=self.tenant, type="Chargeable Repair")

        self.assertTrue(stages["repair"].applies_to(ordinary))
        approved = stages["quote"].outcomes.get(kind="advance")
        self.assertEqual(
            process_service.landing_stage(ordinary, approved.target_stage).key, "repair")

    def test_a_warranty_job_skips_the_quote(self):
        stages = {s.key: s for s in self.seed().stages.all()}
        warranty = WorkItem(tenant=self.tenant, type="Warranty Repair")

        self.assertFalse(stages["quote"].applies_to(warranty))
        self.assertTrue(stages["repair"].applies_to(warranty))

    def test_seeding_twice_does_not_duplicate_fields(self):
        self.seed()
        stages = {s.key: s for s in self.seed().stages.all()}
        self.assertEqual(stages["diagnosis"].checkpoint_fields.count(), 4)
        self.assertEqual(ProcessTemplate.objects.filter(tenant=self.tenant).count(), 1)
        self.assertEqual(CustomField.objects.filter(
            tenant=self.tenant, field_key="repaired_during_diagnosis").count(), 1)
