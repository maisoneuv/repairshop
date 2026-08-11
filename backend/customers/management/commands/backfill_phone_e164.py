"""Populate `phone_e164` for existing customers and leads.

Run after migration 0017 and before relying on E.164 matching. The command is
idempotent - repeated runs only touch rows that have actually drifted.

The report at the end matters more than the write itself: it lists numbers that
cannot be parsed, numbers that are technically possible but invalid, and numbers
pointing at more than one record. The last group decides whether a uniqueness
constraint can ever be added to this field.
"""

import phonenumbers
from django.core.management.base import BaseCommand
from django.db.models import Count

from core.phone import region_for_tenant, to_e164_from_parts
from customers.models import Customer, Lead

# How many example problem numbers to print per category.
SAMPLE_LIMIT = 15


class Command(BaseCommand):
    help = "Populates phone_e164 on Customer and Lead from prefix + phone_number."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count and report, but write nothing to the database.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Write batch size (default 500).",
        )
        parser.add_argument(
            "--tenant",
            help="Tenant subdomain. Processes every tenant by default.",
        )

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.batch_size = options["batch_size"]
        tenant_subdomain = options.get("tenant")

        if self.dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - nothing will be written\n"))

        for model in (Customer, Lead):
            self._process(model, tenant_subdomain)

        self._report_duplicates(tenant_subdomain)

    # --- processing ---

    def _process(self, model, tenant_subdomain):
        label = model.__name__
        qs = (
            model.objects.select_related("tenant")
            .filter(phone_number__isnull=False)
            .exclude(phone_number="")
            .order_by("pk")
        )
        if tenant_subdomain:
            qs = qs.filter(tenant__subdomain=tenant_subdomain)

        total = qs.count()
        self.stdout.write(
            self.style.MIGRATE_HEADING(f"\n=== {label} ({total} with a number) ===")
        )

        pending = []
        unchanged = 0
        updated = 0
        unparseable = []
        suspicious = []

        for obj in qs.iterator(chunk_size=self.batch_size):
            region = region_for_tenant(obj.tenant)
            e164 = to_e164_from_parts(obj.prefix, obj.phone_number, region)

            if e164 is None:
                unparseable.append((obj.pk, obj.prefix, obj.phone_number))
                continue

            if not self._is_valid(e164):
                suspicious.append((obj.pk, obj.phone_number, e164))

            if obj.phone_e164 == e164:
                unchanged += 1
                continue

            obj.phone_e164 = e164
            pending.append(obj)

            if len(pending) >= self.batch_size:
                updated += self._flush(model, pending)
                pending = []

        if pending:
            updated += self._flush(model, pending)

        self.stdout.write(f"  updated:          {updated}")
        self.stdout.write(f"  already correct:  {unchanged}")
        self._print_samples("cannot be parsed", unparseable, self.style.ERROR)
        self._print_samples("possible but invalid per library", suspicious, self.style.WARNING)

    def _flush(self, model, batch):
        if self.dry_run:
            return len(batch)
        # bulk_update deliberately bypasses save(): with a couple of thousand
        # rows we want one query per batch, and the value is computed here anyway.
        model.objects.bulk_update(batch, ["phone_e164"], batch_size=self.batch_size)
        return len(batch)

    @staticmethod
    def _is_valid(e164):
        try:
            return phonenumbers.is_valid_number(phonenumbers.parse(e164, None))
        except phonenumbers.NumberParseException:
            return False

    # --- reporting ---

    def _print_samples(self, title, rows, style):
        if not rows:
            self.stdout.write(f"  {title}: 0")
            return
        self.stdout.write(style(f"  {title}: {len(rows)}"))
        for row in rows[:SAMPLE_LIMIT]:
            self.stdout.write(f"      id={row[0]}  {' | '.join(str(x) for x in row[1:])}")
        if len(rows) > SAMPLE_LIMIT:
            self.stdout.write(f"      ... and {len(rows) - SAMPLE_LIMIT} more")

    def _report_duplicates(self, tenant_subdomain):
        """Numbers pointing at more than one record within a tenant.

        While these exist, lookup has to pick one record deliberately (we take
        the most recent) and no uniqueness constraint can be placed on
        phone_e164 - the migration would fail.
        """
        self.stdout.write(
            self.style.MIGRATE_HEADING("\n=== Numbers pointing at several records ===")
        )

        for model in (Customer, Lead):
            qs = model.objects.filter(phone_e164__isnull=False).exclude(phone_e164="")
            if tenant_subdomain:
                qs = qs.filter(tenant__subdomain=tenant_subdomain)

            dupes = (
                qs.values("tenant_id", "phone_e164")
                .annotate(n=Count("id"))
                .filter(n__gt=1)
                .order_by("-n")
            )
            count = dupes.count()
            if not count:
                self.stdout.write(f"  {model.__name__}: none")
                continue

            self.stdout.write(self.style.WARNING(f"  {model.__name__}: {count}"))
            for row in dupes[:SAMPLE_LIMIT]:
                masked = row["phone_e164"][:6] + "*****"
                ids = list(
                    qs.filter(
                        tenant_id=row["tenant_id"], phone_e164=row["phone_e164"]
                    ).values_list("id", flat=True)[:6]
                )
                self.stdout.write(f"      {masked} -> {row['n']} records, id={ids}")
