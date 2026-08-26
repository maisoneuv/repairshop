"""
Temporary normalisation of phone-like search queries.

Customer phone numbers live in the database as up to 9 digits
(``Customer.phone_number``), with the country code kept in a separate field
(``Customer.prefix``). A number pasted straight from a phone
("+48 123 123 123") therefore never matched any record - the search compared
it against a value that never carried the prefix.

Temporary fix: when the entire query looks like a phone number and carries
more than 9 digits, match on the last 9.

TODO: settle on a single representation - either store E.164 throughout (the
mobile app already relies on ``phone_e164``) or search ``prefix`` and
``phone_number`` together. The heuristic below assumes 9-digit (Polish)
numbers and gives wrong results for international ones.
"""
import re

# A query made up only of characters found in written phone numbers. Anything
# containing a letter (RMA-123, alphanumeric serial numbers) is left alone.
_PHONE_LIKE = re.compile(r'^[+\d\s()\-\.]+$')

_LOCAL_NUMBER_LENGTH = 9
# Shortest number accepted by the Customer.phone_number validator (\d{7,9}).
_MIN_NUMBER_LENGTH = 7


def normalize_phone_query(query_string):
    """Reduce a phone-like query to the form stored in the database.

    - more than 9 digits -> last 9 (the country code is dropped)
    - 7 to 9 digits written with separators -> digits only
    - anything else -> the query, unchanged

    >>> normalize_phone_query('+48123123123')
    '123123123'
    >>> normalize_phone_query('123 123 123')
    '123123123'
    >>> normalize_phone_query('RMA-2026-1234')
    'RMA-2026-1234'
    """
    if not query_string:
        return query_string

    candidate = query_string.strip()
    if not _PHONE_LIKE.match(candidate):
        return query_string

    digits = re.sub(r'\D', '', candidate)

    if len(digits) > _LOCAL_NUMBER_LENGTH:
        return digits[-_LOCAL_NUMBER_LENGTH:]

    if len(digits) >= _MIN_NUMBER_LENGTH:
        return digits

    return query_string
