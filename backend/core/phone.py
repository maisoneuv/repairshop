"""Normalizacja numerow telefonu do E.164.

Jedno miejsce prawdy dla calego backendu. Do tej pory kazdy endpoint
dopasowywal numery po swojemu: `incoming_call` robil dokladne porownanie
stringow z `full_phone_number`, a `customer_lookup` zgadywal podzial na
prefiks w petli po bazie. Skutek na produkcji AL: 139 zarejestrowanych
polaczen, z czego 0 powiazanych z klientem, przy 1931 klientach z numerem.

Aplikacja mobilna dostaje od Androida numer raz jako "+48601234567",
a raz jako "601234567" - zaleznie od tego, jak przekaze go siec. Bez
wspolnej normalizacji po obu stronach ten sam klient bywa rozpoznany
albo nie, w zaleznosci od operatora dzwoniacego.
"""

import re

import phonenumbers
from phonenumbers import NumberParseException

# Uzywany, gdy tenant nie ma ustawionego wlasnego regionu.
DEFAULT_REGION = "PL"

# Fraza zlozona wylacznie ze znakow spotykanych w zapisie numeru.
# Bez tego filtra `phonenumbers` wyluskuje cyfry z czegokolwiek:
# "RMA-2026-1234" stawaloby sie "+4820261234" i mogloby przypadkiem
# trafic w czyjas kartoteke.
_PHONE_LIKE = re.compile(r"^[+\d\s()\-.]+$")


def to_e164(raw, region=DEFAULT_REGION):
    """Sprowadz numer do E.164 (np. "+48601234567") albo zwroc None.

    Akceptujemy numery "mozliwe" (is_possible_number), a nie tylko
    "poprawne" (is_valid_number). Roznica jest celowa: baza zawiera numery
    wpisywane recznie latami i lepiej znormalizowac je deterministycznie,
    niz odrzucic i zostawic klienta nierozpoznanego. Komenda
    `backfill_phone_e164` raportuje osobno te, ktore sa mozliwe, ale
    niepoprawne - zeby rozjazd byl widoczny, a nie cichy.

    >>> to_e164("601234567")
    '+48601234567'
    >>> to_e164("+48 601 234 567")
    '+48601234567'
    >>> to_e164("RMA-123")
    """
    if not raw:
        return None

    candidate = str(raw).strip()
    if not candidate or not _PHONE_LIKE.match(candidate):
        return None

    try:
        parsed = phonenumbers.parse(candidate, region)
    except NumberParseException:
        return None

    if not phonenumbers.is_possible_number(parsed):
        return None

    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def to_e164_from_parts(prefix, national_number, region=DEFAULT_REGION):
    """Zloz numer z pol `prefix` i `phone_number`, tak jak trzyma je CRM.

    Gdy prefiks jest ustawiony, ma pierwszenstwo nad regionem tenanta -
    inaczej klient z numerem brytyjskim wpisanym jako prefix="+44"
    zostalby potraktowany jako polski.
    """
    if not national_number:
        return None

    if prefix:
        combined = f"{prefix}{national_number}".replace(" ", "")
        # Przy jawnym prefiksie region jest nieistotny, parser czyta "+".
        result = to_e164(combined, None)
        if result:
            return result

    return to_e164(national_number, region)


def region_for_tenant(tenant):
    """Region telefoniczny tenanta, z bezpiecznym domyslnym PL."""
    return getattr(tenant, "default_phone_region", None) or DEFAULT_REGION
