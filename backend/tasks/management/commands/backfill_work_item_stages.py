"""Put a tenant's existing work items onto the guided process.

    python manage.py backfill_work_item_stages --tenant=<subdomain> [--dry-run]

Run this **immediately before flipping `workitem.guided_process` on** for a
tenant. Without it every open repair sits off the process with a null
`current_stage`, so the queue and the stage path are empty on day one and staff
have to hand-start each repair (ROLLOUT_AND_ROLLBACK.md §3).

A command, not a data migration, because the rollout is phased per tenant
(ROLLOUT §5): migrations run on deploy for everybody at once and can't be
re-run for a tenant onboarded later. This is idempotent and re-runnable.

**Mapping.** Each work item's legacy `status` is matched (case-insensitively)
against `StageDefinition.status_value`. Several stages usually share one legacy
status — the seeded process maps Diagnosis/Quote/Repair/Handover all to
"In Progress" — so the match is deliberately **conservative: the earliest such
stage wins**. Landing a repair too early is recoverable in one click; claiming
it is further along than it is loses the work in between. Override per status
with `--map`:

    --map "In Progress=repair" --map "Awaiting parts=repair"

Work items whose status matches no stage are left alone and reported; guessing
would be worse than a null.

**`closed_date` is deliberately not written**, even for items landing on the
closing stage. The legacy status flow never recorded one (only
`process_service` does), so there is nothing to migrate and stamping "now" —
or a date inferred from a status-change note — would fabricate history. The
consequence: backfilled closed repairs don't show up in the `closed_after`
report filter until they pass through the closing stage under the new flow.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from tasks.models import ProcessTemplate, StageTransition, WorkItem
from tenants.models import Tenant


class Command(BaseCommand):
    help = "Backfill current_stage/progress on existing work items from their legacy status."

    def add_arguments(self, parser):
        parser.add_argument("--tenant", required=True,
                            help='Tenant subdomain (e.g. "repairhero").')
        parser.add_argument("--process", default=None,
                            help="Process template name (defaults to the tenant's default).")
        parser.add_argument("--map", action="append", default=[], metavar="STATUS=STAGE_KEY",
                            help="Force a legacy status onto a stage. Repeatable.")
        parser.add_argument("--dry-run", action="store_true",
                            help="Report what would change without writing.")

    def handle(self, *args, **options):
        tenant = self._get_tenant(options["tenant"])
        process = self._get_process(tenant, options["process"])
        stages = list(process.stages.order_by("order"))
        if not stages:
            raise CommandError(f'Process "{process.name}" has no stages — seed it first.')

        overrides = self._parse_overrides(options["map"], stages)
        # Earliest stage wins for a shared status_value (see module docstring).
        by_status = {}
        for stage in stages:
            key = (stage.status_value or "").strip().lower()
            if key and key not in by_status:
                by_status[key] = stage
        by_status.update(overrides)

        pending = WorkItem.objects.filter(tenant=tenant, current_stage__isnull=True)
        total = pending.count()
        if not total:
            # "Already migrated" and "no work items at all" both mean no work,
            # but only one of them means the rollout step is genuinely done.
            if WorkItem.objects.filter(tenant=tenant).exists():
                self.stdout.write(self.style.SUCCESS(
                    f"Nothing to do — every work item for {tenant.subdomain} is already on a stage."))
            else:
                self.stdout.write(self.style.WARNING(
                    f"{tenant.subdomain} has no work items at all — nothing to backfill."))
            return

        matched, unmatched = {}, {}
        for item in pending.only("id", "status", "current_stage", "progress"):
            stage = by_status.get((item.status or "").strip().lower())
            if stage is None:
                unmatched.setdefault(item.status or "(blank)", []).append(item.id)
            else:
                matched.setdefault(stage, []).append(item.id)

        self._report(tenant, process, total, matched, unmatched, options["dry_run"])

        if options["dry_run"] or not matched:
            return

        now = timezone.now()
        with transaction.atomic():
            for stage, ids in matched.items():
                WorkItem.objects.filter(pk__in=ids).update(
                    current_stage=stage, progress="in_progress")
                # One clearly-labelled entry so the stage history isn't blank
                # and nobody mistakes a backfill for someone's real action.
                StageTransition.objects.bulk_create([
                    StageTransition(
                        work_item_id=pk, from_stage=None, to_stage=stage, kind="start",
                        by_user=None, started_at=now,
                        note=f"Backfilled onto the guided process from status '{stage.status_value}'.",
                    )
                    for pk in ids
                ])

        self.stdout.write(self.style.SUCCESS(
            f"Backfilled {sum(len(v) for v in matched.values())} work item(s) for {tenant.subdomain}."))

    # ── helpers ──────────────────────────────────────────────────────

    def _get_tenant(self, subdomain):
        try:
            return Tenant.objects.get(subdomain=subdomain)
        except Tenant.DoesNotExist:
            raise CommandError(f'Tenant with subdomain "{subdomain}" not found')

    def _get_process(self, tenant, name):
        qs = ProcessTemplate.objects.filter(tenant=tenant)
        process = qs.filter(name=name).first() if name else qs.filter(is_default=True).first()
        if process is None:
            raise CommandError(
                f'No {"matching" if name else "default"} process template for '
                f'{tenant.subdomain} — run seed_default_process first.'
            )
        return process

    def _parse_overrides(self, raw_maps, stages):
        by_key = {s.key: s for s in stages}
        overrides = {}
        for entry in raw_maps:
            if "=" not in entry:
                raise CommandError(f'--map expects STATUS=STAGE_KEY, got "{entry}"')
            status, _, stage_key = entry.partition("=")
            stage = by_key.get(stage_key.strip())
            if stage is None:
                raise CommandError(
                    f'--map "{entry}": no stage with key "{stage_key.strip()}" '
                    f'(have: {", ".join(sorted(by_key))})'
                )
            overrides[status.strip().lower()] = stage
        return overrides

    def _report(self, tenant, process, total, matched, unmatched, dry_run):
        self.stdout.write(
            f'{"Would backfill" if dry_run else "Backfilling"} {total} work item(s) for '
            f'{tenant.subdomain} using "{process.name}":'
        )
        for stage in sorted(matched, key=lambda s: s.order):
            ids = matched[stage]
            self.stdout.write(f"  {len(ids):>5}  → {stage.name}  (status '{stage.status_value}')")
        for status, ids in sorted(unmatched.items()):
            self.stdout.write(self.style.WARNING(
                f"  {len(ids):>5}  ⨯ status '{status}' matches no stage — left off the process"
            ))
        if unmatched:
            self.stdout.write(self.style.WARNING(
                "  Map those with --map \"<status>=<stage_key>\", or set the stage's "
                "status_value to match, then re-run."
            ))
