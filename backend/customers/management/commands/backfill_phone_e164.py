"""Wypelnia `phone_e164` dla istniejacych klientow i leadow.

Uruchamiac po migracji 0017, przed przelaczeniem endpointow na dopasowanie
po E.164. Komenda jest idempotentna - kolejne uruchomienia nie zmieniaja nic
poza wierszami, ktore realnie sie rozjechaly.

Raport na koncu jest wazniejszy niz sam zapis: pokazuje numery, ktorych nie
da sie sparsowac, numery technicznie mozliwe ale niepoprawne oraz numery
przypisane do wiecej niz jednego rekordu. Te ostatnie decyduja, czy da sie
pozniej zalozyc na tym polu ograniczenie unikalnosci (par. 5.1 pkt 5).
"""

import phonenumbers
from django.core.management.base import BaseCommand
from django.db.models import Count

from core.phone import region_for_tenant, to_e164_from_parts
from customers.models import Customer, Lead

# Ile przykladow problematycznych numerow wypisac na kazda kategorie.
SAMPLE_LIMIT = 15


class Command(BaseCommand):
    help = "Wypelnia phone_e164 dla Customer i Lead na podstawie prefix + phone_number."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Policz i pokaz raport, ale nie zapisuj niczego do bazy.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=500,
            help="Wielkosc partii przy zapisie (domyslnie 500).",
        )
        parser.add_argument(
            "--tenant",
            help="Subdomena tenanta. Domyslnie przetwarza wszystkich.",
        )

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.batch_size = options["batch_size"]
        tenant_subdomain = options.get("tenant")

        if self.dry_run:
            self.stdout.write(self.style.WARNING("TRYB PROBNY - nic nie zostanie zapisane\n"))

        for model in (Customer, Lead):
            self._process(model, tenant_subdomain)

        self._report_duplicates(tenant_subdomain)

    # --- przetwarzanie ---

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
        self.stdout.write(self.style.MIGRATE_HEADING(f"\n=== {label} ({total} z numerem) ==="))

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

        self.stdout.write(f"  zaktualizowane:      {updated}")
        self.stdout.write(f"  juz poprawne:        {unchanged}")
        self._print_samples("nie da sie sparsowac", unparseable, self.style.ERROR)
        self._print_samples("mozliwe, ale niepoprawne wg biblioteki", suspicious, self.style.WARNING)

    def _flush(self, model, batch):
        if self.dry_run:
            return len(batch)
        # bulk_update swiadomie omija save(): przy 2 tys. rekordow chcemy
        # jedno zapytanie na partie, a wartosc i tak liczymy tu samodzielnie.
        model.objects.bulk_update(batch, ["phone_e164"], batch_size=self.batch_size)
        return len(batch)

    @staticmethod
    def _is_valid(e164):
        try:
            return phonenumbers.is_valid_number(phonenumbers.parse(e164, None))
        except phonenumbers.NumberParseException:
            return False

    # --- raport ---

    def _print_samples(self, title, rows, style):
        if not rows:
            self.stdout.write(f"  {title}: 0")
            return
        self.stdout.write(style(f"  {title}: {len(rows)}"))
        for row in rows[:SAMPLE_LIMIT]:
            self.stdout.write(f"      id={row[0]}  {' | '.join(str(x) for x in row[1:])}")
        if len(rows) > SAMPLE_LIMIT:
            self.stdout.write(f"      ... i {len(rows) - SAMPLE_LIMIT} wiecej")

    def _report_duplicates(self, tenant_subdomain):
        """Numery wskazujace na wiecej niz jeden rekord w obrebie tenanta.

        Dopoki takie istnieja, lookup musi swiadomie wybierac jeden rekord
        (bierzemy najnowszy), a na phone_e164 nie wolno zalozyc ograniczenia
        unikalnosci - migracja by sie wywrocila.
        """
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Numery wskazujace wielu klientow ==="))

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
                self.stdout.write(f"  {model.__name__}: brak")
                continue

            self.stdout.write(self.style.WARNING(f"  {model.__name__}: {count}"))
            for row in dupes[:SAMPLE_LIMIT]:
                masked = row["phone_e164"][:6] + "*****"
                ids = list(
                    qs.filter(
                        tenant_id=row["tenant_id"], phone_e164=row["phone_e164"]
                    ).values_list("id", flat=True)[:6]
                )
                self.stdout.write(f"      {masked} -> {row['n']} rekordow, id={ids}")
