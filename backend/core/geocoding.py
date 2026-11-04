"""Address → coordinates lookup.

Nominatim (OpenStreetMap) is free but its usage policy allows at most one
request per second and requires an identifying User-Agent, so every call goes
through `geocode()`, which enforces both. Swap providers via GEOCODER_PROVIDER.
"""
import logging
import threading
import time
from decimal import Decimal

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from django.utils import timezone

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_MIN_INTERVAL_SECONDS = 1.0
_lock = threading.Lock()
_last_request_at = 0.0

# A first connection that times out or resets is common enough that one flaky
# request shouldn't send the user to place the pin by hand.
_session = requests.Session()
_session.mount("https://", HTTPAdapter(max_retries=Retry(
    total=2, connect=2, read=2, status=0, backoff_factor=1, allowed_methods=["GET"],
)))


def _throttle():
    global _last_request_at
    with _lock:
        wait = _MIN_INTERVAL_SECONDS - (time.monotonic() - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


class GeocoderUnavailable(Exception):
    """The provider refuses all requests (misconfiguration), as opposed to one
    address failing. Retrying won't help until settings change."""


def _nominatim(query):
    if not settings.GEOCODER_USER_AGENT:
        raise GeocoderUnavailable(
            "Set GEOCODER_USER_AGENT to your app name and a real contact email, "
            "e.g. 'fixed-service/1.0 (you@yourshop.pl)'. Nominatim refuses anonymous requests."
        )
    _throttle()
    response = _session.get(
        NOMINATIM_URL,
        params={"q": query, "format": "jsonv2", "limit": 1, "addressdetails": 1},
        headers={"User-Agent": settings.GEOCODER_USER_AGENT},
        timeout=10,
    )
    if response.status_code == 403:
        raise GeocoderUnavailable(
            f"Nominatim blocked the User-Agent {settings.GEOCODER_USER_AGENT!r}. Set GEOCODER_USER_AGENT "
            "to your app name and a real contact email (placeholder addresses such as example.com are rejected)."
        )
    response.raise_for_status()
    results = response.json()
    if not results:
        return None
    best = results[0]
    return {
        "latitude": Decimal(best["lat"]).quantize(Decimal("0.000001")),
        "longitude": Decimal(best["lon"]).quantize(Decimal("0.000001")),
        "label": best.get("display_name", ""),
        "postal_code": (best.get("address") or {}).get("postcode", ""),
    }


PROVIDERS = {"nominatim": _nominatim}


def geocode(query):
    """Return {"latitude", "longitude", "label"}, or None when the address isn't found."""
    provider = PROVIDERS[settings.GEOCODER_PROVIDER]
    return provider(query)


def geocode_address(address):
    """Geocode and save `address` in place. Manually placed pins are kept."""
    from core.models import Address

    if address.geocode_status == Address.GEOCODE_MANUAL:
        return address
    match = geocode(address.geocode_query())
    if match:
        address.latitude = match["latitude"]
        address.longitude = match["longitude"]
        address.geocode_status = Address.GEOCODE_OK
    else:
        address.geocode_status = Address.GEOCODE_FAILED
    address.geocoded_at = timezone.now()
    address.save(update_fields=["latitude", "longitude", "geocode_status", "geocoded_at"])
    return address
