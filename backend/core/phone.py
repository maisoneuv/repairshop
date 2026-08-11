"""Phone number normalisation to E.164.

Single source of truth for the whole backend: any code matching a caller's
number must go through these helpers, so that two endpoints cannot give
different answers to the same question.

Android hands us a number sometimes as "+48601234567" and sometimes as
"601234567", depending on how the network delivers it. Without shared
normalisation on both sides, recognising a customer would depend on the
caller's operator.
"""

import re

import phonenumbers
from phonenumbers import NumberParseException

# Used when a tenant has no region of its own configured.
DEFAULT_REGION = "PL"

# A string made up solely of characters found in written phone numbers. The
# filter is required because `phonenumbers` will extract digits from anything:
# "RMA-2026-1234" would become "+4820261234" and could land on someone's record.
_PHONE_LIKE = re.compile(r"^[+\d\s()\-.]+$")


def to_e164(raw, region=DEFAULT_REGION):
    """Reduce a number to E.164 (e.g. "+48601234567"), or return None.

    The acceptance threshold is is_possible_number rather than is_valid_number:
    the database holds numbers typed in by hand over the years, and it is better
    to normalise them deterministically than to reject them and leave the
    customer unrecognised. Numbers that are possible but not valid are reported
    separately by the `backfill_phone_e164` command.

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
    """Assemble a number from the `prefix` and `phone_number` fields.

    An explicit prefix takes precedence over the tenant's region, so that a
    customer stored with prefix="+44" is not treated as Polish.
    """
    if not national_number:
        return None

    if prefix:
        combined = f"{prefix}{national_number}".replace(" ", "")
        # With an explicit prefix the region is irrelevant, the parser reads "+".
        result = to_e164(combined, None)
        if result:
            return result

    return to_e164(national_number, region)


def region_for_tenant(tenant):
    """The tenant's phone region, falling back to PL."""
    return getattr(tenant, "default_phone_region", None) or DEFAULT_REGION
