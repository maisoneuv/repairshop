import requests
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from core.geocoding import GeocoderUnavailable, geocode_address
from core.models import Address


class Command(BaseCommand):
    help = "Geocode addresses that have no coordinates yet (runs inline, 1 request/second)."

    def add_arguments(self, parser):
        parser.add_argument("--retry-failed", action="store_true", help="Also retry addresses that were not found.")
        parser.add_argument("--limit", type=int, default=None)

    def handle(self, *args, **options):
        statuses = [Address.GEOCODE_PENDING]
        if options["retry_failed"]:
            statuses.append(Address.GEOCODE_FAILED)
        queryset = Address.objects.filter(
            Q(geocode_status__in=statuses)
            | Q(latitude__isnull=True, geocode_status__in=[Address.GEOCODE_OK, Address.GEOCODE_MANUAL])
        ).order_by("id")
        if options["limit"]:
            queryset = queryset[: options["limit"]]

        found = missing = errors = 0
        for address in queryset:
            try:
                geocode_address(address)
            except GeocoderUnavailable as exc:
                raise CommandError(f"{exc}\nGeocoded {found}, not found {missing} before stopping.")
            except requests.RequestException as exc:
                errors += 1
                self.stderr.write(f"Error: #{address.pk} {address.geocode_query()}: {exc}")
                continue
            if address.geocode_status == Address.GEOCODE_OK:
                found += 1
            else:
                missing += 1
                self.stdout.write(f"Not found: #{address.pk} {address.geocode_query()}")
        summary = f"Geocoded {found}, not found {missing}."
        if errors:
            summary += f" {errors} failed with errors and stay pending; run again to retry them."
        self.stdout.write(self.style.SUCCESS(summary))
