"""Seed the default RepairHub guided process for a tenant.

    python manage.py seed_default_process --tenant=<subdomain>

Idempotent — re-running updates the same template in place. Creates the
ProcessTemplate + 6 stages + their outcomes and checkpoint fields from
design/work-item-detail-redesign/WORK_ITEM_DETAIL_MODEL.md §8.

Nothing here touches existing work items or the legacy `status` flow. Each
stage's `status_value` maps onto the common coarse legacy statuses
(New / In Progress / Resolved) so dual-write stays compatible with a default
picklist; refine per stage in the admin if a tenant uses finer statuses.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from tasks.models import (
    ProcessTemplate, StageDefinition, StageOutcome, CheckpointField,
)
from tenants.models import Tenant

TEMPLATE_NAME = "Default repair process"

# Reference process (§8). `fields` are standard WorkItem column keys.
#
# Note-first discipline (§3): anything §8 describes as "(note)" — Diagnosis
# findings, Repair's tests performed — is captured by the checkpoint's note, not
# by a field here. The exception is `issue_diagnosis`/`required_parts`/
# `estimated_effort`: those three are structured because Quote's recap has to
# read them back while pricing the job, which it can't do from a free-text
# transition note. Everything else a shop wants adds as a custom field.
#
# `status` maps onto the coarse legacy statuses.
STAGES = [
    dict(key="new", name="New", owner="owner", status="New", order=0,
         guidance="Register the device, give the customer their receipt, and assign a technician to diagnose.",
         fields=[("technician", True), ("priority", False)],
         outcomes=[
             dict(kind="advance", label="Assign & send to diagnosis", to="diagnosis"),
         ]),
    dict(key="diagnosis", name="Diagnosis", owner="technician", status="In Progress", order=1,
         guidance="Confirm the reported fault, find the root cause, and decide if it can be repaired.",
         # "Confirm the reported fault" is the first instruction of this stage,
         # so the technician needs the fault as the customer reported it in
         # front of them. It arrives at intake, not from an earlier checkpoint.
         recap=["item.description"],
         # Required: Quote cannot price a repair whose findings were never
         # written down, and a diagnosis that leaves no trace is the exact
         # failure this redesign exists to fix (§1).
         fields=[("issue_diagnosis", True), ("required_parts", False),
                 ("estimated_effort", False)],
         outcomes=[
             dict(kind="advance", label="Finish diagnosis → Quote", to="quote"),
             dict(kind="pause", label="Missing accessory — call customer", waiting_on="customer",
                  reassign=True, resume="technician", resolve="Customer returned it → back to technician"),
             dict(kind="pause", label="Need parts to diagnose", waiting_on="supplier",
                  resolve="Parts arrived — resume diagnosis"),
         ]),
    dict(key="quote", name="Quote", owner="owner", status="In Progress", order=2,
         guidance="Work out the repair cost from the diagnosis, contact the customer, and record their decision.",
         # You cannot price a repair without the findings in front of you (§7).
         recap=["diagnosis"],
         fields=[("estimated_price", True)],
         outcomes=[
             dict(kind="advance", label="Approved → Repair", to="repair"),
             dict(kind="pause", label="Customer will call back", waiting_on="customer",
                  resolve="Log the customer's decision"),
             dict(kind="exit", label="Declined — return device", to="handover"),
             dict(kind="exit", label="Declined — dispose", to="closed"),
         ]),
    dict(key="repair", name="Repair", owner="technician", status="In Progress", order=3,
         guidance="Carry out the repair and test the device before handover.",
         # Findings and parts, but not the effort estimate — that was for pricing.
         recap=["diagnosis.issue_diagnosis", "diagnosis.required_parts"],
         # §8 captures "tests performed" here — that's a note, not a field.
         fields=[],
         outcomes=[
             dict(kind="advance", label="Repaired & tested → Handover", to="handover"),
             dict(kind="pause", label="Waiting for parts", waiting_on="supplier",
                  resolve="Parts arrived — resume repair"),
             dict(kind="exit", label="Can't be fixed — return", to="handover", reassign=True),
         ]),
    dict(key="handover", name="Handover", owner="owner", status="In Progress", order=4,
         guidance="Notify the customer, collect any balance, and hand over the device with its warranty document.",
         # §8's "work done · balance to collect": the Repair note is the work
         # done; the quoted price is what you agreed to charge for it.
         recap=["repair.note", "quote.estimated_price"],
         # Optional on purpose: a warranty repair settles at no charge, and
         # requiring money fields would block closing it.
         fields=[("final_price", False), ("payment_method", False)],
         outcomes=[
             dict(kind="advance", label="Complete handover → Close", to="closed"),
         ]),
    dict(key="closed", name="Closed", owner="any", status="Resolved", order=5,
         guidance="Order closed — read-only summary.",
         fields=[], outcomes=[]),
]


class Command(BaseCommand):
    help = "Seed the default guided repair process for a tenant (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True,
                            help='Tenant subdomain (e.g., "repairhero").')

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(subdomain=options["tenant"])
        except Tenant.DoesNotExist:
            raise CommandError(f'Tenant with subdomain "{options["tenant"]}" not found')

        template, created = ProcessTemplate.objects.get_or_create(
            tenant=tenant, name=TEMPLATE_NAME, defaults={"is_default": True},
        )
        self.stdout.write(f'{"Created" if created else "Updating"} template "{template.name}" for {tenant.subdomain}')

        # Pass 1 — stages (so target_stage FKs can resolve in pass 2).
        stage_by_key = {}
        for s in STAGES:
            stage, _ = StageDefinition.objects.update_or_create(
                process=template, key=s["key"],
                defaults=dict(name=s["name"], owner_role=s["owner"],
                              status_value=s["status"], guidance=s["guidance"],
                              recap_sources=s.get("recap", []), order=s["order"]),
            )
            stage_by_key[s["key"]] = stage

        # Pass 2 — replace each stage's outcomes and checkpoint fields (idempotent).
        for s in STAGES:
            stage = stage_by_key[s["key"]]
            stage.outcomes.all().delete()
            stage.checkpoint_fields.all().delete()

            for i, o in enumerate(s["outcomes"]):
                StageOutcome.objects.create(
                    stage=stage, order=i, kind=o["kind"], label=o["label"],
                    target_stage=stage_by_key.get(o.get("to")),
                    waiting_on=o.get("waiting_on", ""),
                    reassign_to_owner=o.get("reassign", False),
                    resume_returns_to=o.get("resume", ""),
                    resolve_label=o.get("resolve", ""),
                )
            for i, (key, required) in enumerate(s["fields"]):
                CheckpointField.objects.create(
                    stage=stage, order=i, standard_key=key, required=required,
                )

        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(STAGES)} stages for {tenant.subdomain}. "
            f"Enable with the '{'workitem.guided_process'}' setting when ready."
        ))
