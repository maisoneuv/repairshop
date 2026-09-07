"""Tests for `backfill_work_item_stages` — the rollout prerequisite.

The risky parts are the ones covered here: the mapping is ambiguous by design
(several stages share one legacy status), it runs against live tenant data, and
it must be safe to re-run.

Run: `python manage.py test tasks.test_backfill_stages`
"""
from io import StringIO

from django.core.management import CommandError, call_command
from django.test import TestCase

from core.models import Address
from customers.models import Customer
from service.models import Employee, Location, RepairShop
from tenants.models import Tenant

from .models import (
    ProcessTemplate, StageDefinition, StageTransition, WorkItem,
)


class BackfillWorkItemStagesTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Backfill", subdomain="backfill")
        cls.other = Tenant.objects.create(name="Other", subdomain="backfill-other")

        address = Address.objects.create(
            street="Main", building_number="1", city="City", postal_code="00-001")
        shop = RepairShop.objects.create(
            tenant=cls.tenant, name="Shop", type="internal", address=address)
        cls.location = Location.objects.create(
            tenant=cls.tenant, name="Bench", type="shop", shop=shop)
        from core.models import User
        user = User.objects.create_user(
            username="bf@example.com", email="bf@example.com", password="pw", tenant=cls.tenant)
        cls.employee = Employee.objects.create(
            tenant=cls.tenant, user=user, role="owner", location=cls.location)
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, first_name="Cust", last_name="Backfill", phone_number="600000009")

        cls.process = ProcessTemplate.objects.create(
            tenant=cls.tenant, name="Default repair process", is_default=True)
        cls.stage_new = StageDefinition.objects.create(
            process=cls.process, key="new", name="New", status_value="New",
            owner_role="owner", order=0)
        # Three stages share one legacy status — the real ambiguity.
        cls.stage_diag = StageDefinition.objects.create(
            process=cls.process, key="diagnosis", name="Diagnosis",
            status_value="In Progress", owner_role="technician", order=1)
        cls.stage_repair = StageDefinition.objects.create(
            process=cls.process, key="repair", name="Repair",
            status_value="In Progress", owner_role="technician", order=2)
        cls.stage_closed = StageDefinition.objects.create(
            process=cls.process, key="closed", name="Closed", status_value="Resolved",
            owner_role="any", order=3)

    def _work_item(self, status, tenant=None):
        return WorkItem.objects.create(
            tenant=tenant or self.tenant, customer=self.customer, description="Repair",
            owner=self.employee, dropoff_point=self.location, status=status)

    def _run(self, *args, **kwargs):
        out = StringIO()
        call_command("backfill_work_item_stages", *args, stdout=out, stderr=out, **kwargs)
        return out.getvalue()

    def test_maps_each_status_to_a_stage(self):
        new = self._work_item("New")
        closed = self._work_item("Resolved")

        self._run("--tenant=backfill")

        new.refresh_from_db()
        closed.refresh_from_db()
        self.assertEqual(new.current_stage_id, self.stage_new.id)
        self.assertEqual(new.progress, "in_progress")
        self.assertEqual(closed.current_stage_id, self.stage_closed.id)

    def test_ambiguous_status_lands_on_the_earliest_stage(self):
        """Diagnosis and Repair both map to 'In Progress'. Landing too early is
        one click to fix; landing too late silently skips real work."""
        item = self._work_item("In Progress")
        self._run("--tenant=backfill")
        item.refresh_from_db()
        self.assertEqual(item.current_stage_id, self.stage_diag.id)

    def test_map_option_overrides_the_conservative_default(self):
        item = self._work_item("In Progress")
        self._run("--tenant=backfill", "--map=In Progress=repair")
        item.refresh_from_db()
        self.assertEqual(item.current_stage_id, self.stage_repair.id)

    def test_status_matching_is_case_insensitive(self):
        item = self._work_item("in progress")
        self._run("--tenant=backfill")
        item.refresh_from_db()
        self.assertEqual(item.current_stage_id, self.stage_diag.id)

    def test_unknown_status_is_left_alone_and_reported(self):
        item = self._work_item("Awaiting courier")
        output = self._run("--tenant=backfill")
        item.refresh_from_db()
        self.assertIsNone(item.current_stage_id, "must not guess a stage")
        self.assertIn("Awaiting courier", output)
        self.assertIn("matches no stage", output)

    def test_dry_run_writes_nothing(self):
        item = self._work_item("New")
        output = self._run("--tenant=backfill", "--dry-run")
        item.refresh_from_db()
        self.assertIsNone(item.current_stage_id)
        self.assertEqual(StageTransition.objects.count(), 0)
        self.assertIn("Would backfill", output)

    def test_is_idempotent_and_never_moves_a_live_item(self):
        item = self._work_item("New")
        self._run("--tenant=backfill")
        # Someone advances it for real…
        item.refresh_from_db()
        item.current_stage = self.stage_repair
        item.save(update_fields=["current_stage"])

        self._run("--tenant=backfill")

        item.refresh_from_db()
        self.assertEqual(item.current_stage_id, self.stage_repair.id,
                         "re-running must not drag an in-flight repair back")
        self.assertEqual(StageTransition.objects.filter(work_item=item).count(), 1)

    def test_writes_one_labelled_transition_so_history_is_not_blank(self):
        item = self._work_item("New")
        self._run("--tenant=backfill")
        transition = StageTransition.objects.get(work_item=item)
        self.assertEqual(transition.kind, "start")
        self.assertIsNone(transition.by_user, "a backfill is nobody's action")
        self.assertIn("Backfilled", transition.note)

    def test_distinguishes_no_work_items_from_all_migrated(self):
        """Both are "nothing to do", but only one means the step is done."""
        ProcessTemplate.objects.create(tenant=self.other, name="P", is_default=True)
        StageDefinition.objects.create(
            process=ProcessTemplate.objects.get(tenant=self.other), key="new",
            name="New", status_value="New", order=0)
        self.assertIn("no work items at all", self._run("--tenant=backfill-other"))

        self._work_item("New")
        self._run("--tenant=backfill")
        self.assertIn("already on a stage", self._run("--tenant=backfill"))

    def test_does_not_touch_other_tenants(self):
        theirs = self._work_item("New", tenant=self.other)
        self._run("--tenant=backfill")
        theirs.refresh_from_db()
        self.assertIsNone(theirs.current_stage_id)

    def test_requires_a_seeded_process(self):
        with self.assertRaises(CommandError) as ctx:
            self._run("--tenant=backfill-other")
        self.assertIn("seed_default_process", str(ctx.exception))

    def test_rejects_an_unknown_stage_key_in_map(self):
        with self.assertRaises(CommandError) as ctx:
            self._run("--tenant=backfill", "--map=New=nope")
        self.assertIn("no stage with key", str(ctx.exception))
