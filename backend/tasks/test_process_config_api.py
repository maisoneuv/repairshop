"""The process configuration API (§7D) — Settings → Work item process.

Covers what Django admin used to be the only surface for: who may rewire a
shop's process, that the model's own guards survive the trip through DRF, and
that repairs can't be stranded by a stage being deleted underneath them.
"""
from django.contrib.auth.models import Permission
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import (
    Address, CustomField, PicklistValue, Role, RolePermission, Setting, User, UserRole,
)
from customers.models import Customer
from service.models import Employee, Location, RepairShop
from tenants.models import Tenant

from .models import (
    CheckpointField, ProcessTemplate, StageDefinition, StageOutcome, WorkItem,
)

TEMPLATES = "/api/tasks/process-templates/"
STAGES = "/api/tasks/stages/"
OUTCOMES = "/api/tasks/stage-outcomes/"
CHECKPOINTS = "/api/tasks/checkpoint-fields/"


def _grant(user, tenant, name, *codenames):
    role = Role.objects.create(name=name, tenant=tenant)
    for codename in codenames:
        perm = Permission.objects.filter(codename=codename).first()
        if perm:
            RolePermission.objects.create(role=role, permission=perm)
    UserRole.objects.create(user=user, role=role)
    return role


class ProcessConfigAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Shop", subdomain="shop")
        cls.other_tenant = Tenant.objects.create(name="Rival", subdomain="rival")

        # Tenant provisioning seeds these; make sure they're there regardless.
        for value in ("Chargeable Repair", "Warranty Repair"):
            PicklistValue.objects.get_or_create(
                tenant=cls.tenant, category="workitem_type", value=value,
                defaults={"name": value, "is_active": True})

        cls.admin_user = User.objects.create_user(
            username="admin@example.com", email="admin@example.com",
            password="pw", tenant=cls.tenant)
        cls.bench_user = User.objects.create_user(
            username="bench@example.com", email="bench@example.com",
            password="pw", tenant=cls.tenant)
        _grant(cls.admin_user, cls.tenant, "Admins", "manage_process")
        _grant(cls.bench_user, cls.tenant, "Bench")

        cls.process = ProcessTemplate.objects.create(
            tenant=cls.tenant, name="Default repair process", is_default=True)
        cls.stage_new = StageDefinition.objects.create(
            process=cls.process, key="new", name="New", owner_role="owner", order=0)
        cls.stage_repair = StageDefinition.objects.create(
            process=cls.process, key="repair", name="Repair",
            owner_role="technician", order=1)
        cls.stage_closed = StageDefinition.objects.create(
            process=cls.process, key="closed", name="Closed", owner_role="any", order=2)

        cls.checkbox = CustomField.objects.create(
            tenant=cls.tenant, model_name="workitem", label="Repaired during diagnosis",
            field_key="repaired_during_diagnosis", field_type="checkbox")

        # A rival shop's process, to prove ids don't cross tenants.
        cls.other_process = ProcessTemplate.objects.create(
            tenant=cls.other_tenant, name="Theirs", is_default=True)
        cls.other_stage = StageDefinition.objects.create(
            process=cls.other_process, key="theirs", name="Theirs", order=0)

    def client_for(self, user, tenant=None):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_TENANT=(tenant or self.tenant).subdomain)
        return client

    @property
    def admin(self):
        return self.client_for(self.admin_user)

    @staticmethod
    def rows(response):
        """These routes are unpaginated today; tolerate either shape."""
        body = response.json()
        return body["results"] if isinstance(body, dict) else body

    # ── who may configure ────────────────────────────────────────────

    def test_configuring_the_process_needs_more_than_being_in_the_tenant(self):
        resp = self.client_for(self.bench_user).patch(
            f"{STAGES}{self.stage_repair.id}/", {"name": "Fixing"}, format="json")
        self.assertEqual(resp.status_code, 403)
        self.stage_repair.refresh_from_db()
        self.assertEqual(self.stage_repair.name, "Repair")

    def test_anyone_in_the_tenant_can_read_the_process(self):
        resp = self.client_for(self.bench_user).get(STAGES)
        self.assertEqual(resp.status_code, 200)

    def test_an_admin_can_rename_a_stage(self):
        resp = self.admin.patch(
            f"{STAGES}{self.stage_repair.id}/", {"name": "Fixing"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.stage_repair.refresh_from_db()
        self.assertEqual(self.stage_repair.name, "Fixing")

    def test_the_config_api_answers_with_the_guided_flag_off(self):
        """An admin has to be able to build the process before turning it on."""
        self.assertFalse(Setting.objects.filter(
            tenant=self.tenant, key="workitem.guided_process").exists())
        self.assertEqual(self.admin.get(STAGES).status_code, 200)
        self.assertEqual(self.admin.get(TEMPLATES).status_code, 200)

    # ── tenant isolation ─────────────────────────────────────────────

    def test_another_shops_stages_are_not_listed(self):
        keys = {s["key"] for s in self.rows(self.admin.get(STAGES))}
        self.assertNotIn("theirs", keys)

    def test_another_shops_stage_cannot_be_edited(self):
        resp = self.admin.patch(
            f"{STAGES}{self.other_stage.id}/", {"name": "Mine now"}, format="json")
        self.assertEqual(resp.status_code, 404)

    def test_an_outcome_cannot_target_another_shops_stage(self):
        resp = self.admin.post(OUTCOMES, {
            "stage": self.stage_new.id, "kind": "advance", "label": "Go",
            "target_stage": self.other_stage.id,
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("target_stage", resp.json())

    # ── the model's guards survive the trip through DRF ──────────────

    def test_a_skip_rule_naming_an_unknown_field_is_rejected(self):
        """DRF does not call Model.clean(), so without the serializer running
        full_clean() this would save and then silently never fire."""
        resp = self.admin.patch(f"{STAGES}{self.stage_repair.id}/", {
            "skip_when": [{"field": "repaired_on_the_moon", "equals": True}],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("skip_when", resp.json())
        self.stage_repair.refresh_from_db()
        self.assertEqual(self.stage_repair.skip_when, [])

    def test_a_skip_rule_on_a_real_custom_field_is_accepted(self):
        resp = self.admin.patch(f"{STAGES}{self.stage_repair.id}/", {
            "skip_when": [{"field": "repaired_during_diagnosis", "equals": True,
                           "label": "Repaired during diagnosis"}],
        }, format="json")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.stage_repair.refresh_from_db()
        self.assertEqual(self.stage_repair.skip_when[0]["field"],
                         "repaired_during_diagnosis")

    def test_a_recap_source_pointing_forward_is_rejected(self):
        resp = self.admin.patch(f"{STAGES}{self.stage_new.id}/", {
            "recap_sources": ["repair"],
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("recap_sources", resp.json())

    def test_two_stages_cannot_share_a_key(self):
        resp = self.admin.post(STAGES, {
            "process": self.process.id, "key": "repair", "name": "Repair again",
            "owner_role": "any", "order": 9,
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_an_advance_outcome_needs_somewhere_to_go(self):
        resp = self.admin.post(OUTCOMES, {
            "stage": self.stage_new.id, "kind": "advance", "label": "Nowhere",
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("target_stage", resp.json())

    def test_a_checkpoint_field_needs_exactly_one_source(self):
        for payload in ({}, {"standard_key": "priority",
                             "custom_field": self.checkbox.id}):
            resp = self.admin.post(CHECKPOINTS, {
                "stage": self.stage_new.id, "required": False, **payload,
            }, format="json")
            self.assertEqual(resp.status_code, 400, payload)

    def test_a_checkpoint_field_on_a_column_that_does_not_exist_is_rejected(self):
        resp = self.admin.post(CHECKPOINTS, {
            "stage": self.stage_new.id, "standard_key": "colour_of_the_case",
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("standard_key", resp.json())

    def test_a_checkpoint_field_can_reference_a_custom_field(self):
        resp = self.admin.post(CHECKPOINTS, {
            "stage": self.stage_new.id, "custom_field": self.checkbox.id,
            "required": False, "order": 0,
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)

    # ── the delete guard (§7D) ───────────────────────────────────────

    def parked_work_item(self, stage):
        address = Address.objects.create(
            street="Main", building_number="1", city="City", postal_code="00-001")
        shop = RepairShop.objects.create(
            tenant=self.tenant, name="Shop", type="internal", address=address)
        location = Location.objects.create(
            tenant=self.tenant, name="Bench", type="shop", shop=shop)
        customer = Customer.objects.create(
            tenant=self.tenant, first_name="C", last_name="One",
            phone_number="600000001")
        owner = Employee.objects.create(
            tenant=self.tenant, user=self.admin_user, role="owner", location=location)
        return WorkItem.objects.create(
            tenant=self.tenant, customer=customer, description="Cracked screen",
            owner=owner, dropoff_point=location, status="New", current_stage=stage)

    def test_a_stage_with_no_work_items_deletes(self):
        resp = self.admin.delete(f"{STAGES}{self.stage_repair.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(StageDefinition.objects.filter(pk=self.stage_repair.pk).exists())

    def test_deleting_a_stage_under_live_repairs_is_blocked(self):
        work_item = self.parked_work_item(self.stage_repair)
        resp = self.admin.delete(f"{STAGES}{self.stage_repair.id}/")

        self.assertEqual(resp.status_code, 400)
        self.assertIn("move_to", resp.json())
        self.assertTrue(StageDefinition.objects.filter(pk=self.stage_repair.pk).exists())
        work_item.refresh_from_db()
        self.assertEqual(work_item.current_stage_id, self.stage_repair.id)

    def test_deleting_a_busy_stage_moves_its_repairs_somewhere(self):
        work_item = self.parked_work_item(self.stage_repair)
        resp = self.admin.delete(
            f"{STAGES}{self.stage_repair.id}/?move_to={self.stage_closed.id}")

        self.assertEqual(resp.status_code, 204)
        work_item.refresh_from_db()
        self.assertEqual(work_item.current_stage_id, self.stage_closed.id)

    def test_repairs_cannot_be_moved_onto_the_stage_being_deleted(self):
        self.parked_work_item(self.stage_repair)
        resp = self.admin.delete(
            f"{STAGES}{self.stage_repair.id}/?move_to={self.stage_repair.id}")
        self.assertEqual(resp.status_code, 400)

    # ── reordering ───────────────────────────────────────────────────

    def test_stages_can_be_reordered(self):
        resp = self.admin.post(f"{STAGES}reorder/", {
            "process": self.process.id,
            "ordered_ids": [self.stage_closed.id, self.stage_new.id, self.stage_repair.id],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            [s.key for s in self.process.stages.order_by("order")],
            ["closed", "new", "repair"])

    def test_reordering_ignores_ids_from_another_shop(self):
        resp = self.admin.post(f"{STAGES}reorder/", {
            "process": self.process.id,
            "ordered_ids": [self.other_stage.id, self.stage_new.id],
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["ordered_ids"], [self.stage_new.id])
        self.other_stage.refresh_from_db()
        self.assertEqual(self.other_stage.order, 0)

    def test_reordering_needs_the_permission(self):
        resp = self.client_for(self.bench_user).post(f"{STAGES}reorder/", {
            "process": self.process.id, "ordered_ids": [self.stage_closed.id],
        }, format="json")
        self.assertEqual(resp.status_code, 403)

    # ── listing shape the settings page relies on ────────────────────

    def test_a_stage_reports_how_many_repairs_are_on_it(self):
        self.parked_work_item(self.stage_repair)
        rows = {s["key"]: s for s in self.rows(self.admin.get(STAGES))}
        self.assertEqual(rows["repair"]["work_item_count"], 1)
        self.assertEqual(rows["new"]["work_item_count"], 0)

    def test_outcomes_can_be_filtered_to_one_stage(self):
        StageOutcome.objects.create(
            stage=self.stage_new, kind="advance", label="Go",
            target_stage=self.stage_repair, order=0)
        StageOutcome.objects.create(
            stage=self.stage_repair, kind="advance", label="Done",
            target_stage=self.stage_closed, order=0)

        rows = self.rows(self.admin.get(f"{OUTCOMES}?stage={self.stage_new.id}"))
        self.assertEqual([r["label"] for r in rows], ["Go"])

    def test_checkpoint_fields_can_be_filtered_to_one_stage(self):
        CheckpointField.objects.create(
            stage=self.stage_new, standard_key="priority", order=0)
        rows = self.rows(self.admin.get(
            f"{CHECKPOINTS}?stage={self.stage_new.id}"))
        self.assertEqual([r["standard_key"] for r in rows], ["priority"])
