"""Normalizacja numerow telefonu do E.164.

Jedno miejsce prawdy dla calego backendu: kazdy kod dopasowujacy numer
dzwoniacego ma uzywac tych funkcji, zeby dwa endpointy nie mogly udzielic
roznych odpowiedzi na to samo pytanie.

Android przekazuje numer raz jako "+48601234567", a raz jako "601234567" -
zaleznie od tego, jak poda go siec. Bez wspolnej normalizacji po obu stronach
rozpoznanie klienta zalezaloby od operatora dzwoniacego.
"""

import re

import phonenumbers
from phonenumbers import NumberParseException

# Uzywany, gdy tenant nie ma ustawionego wlasnego regionu.
DEFAULT_REGION = "PL"

# Fraza zlozona wylacznie ze znakow spotykanych w zapisie numeru. Filtr jest
# konieczny, bo `phonenumbers` wyluskuje cyfry z czegokolwiek - "RMA-2026-1234"
# stalby sie "+4820261234" i mogl trafic w czyjas kartoteke.
_PHONE_LIKE = re.compile(r"^[+\d\s()\-.]+$")


def to_e164(raw, region=DEFAULT_REGION):
    """Sprowadz numer do E.164 (np. "+48601234567") albo zwroc None.

    Prog akceptacji to is_possible_number, a nie is_valid_number: baza zawiera
    numery wpisywane recznie latami i lepiej znormalizowac je deterministycznie,
    niz odrzucic i zostawic klienta nierozpoznanego. Numery mozliwe, ale
    niepoprawne, raportuje osobno komenda `backfill_phone_e164`.

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
