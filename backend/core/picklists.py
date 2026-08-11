"""Reading status semantics from the configurable picklists.

Work item statuses are defined per tenant and mix languages ("Resolved",
"wydane_bez_naprawy", "UTYLIZACJA"), so the name alone does not tell whether
a repair is still running. That information lives in
`PicklistValue.status_role`.

Code should therefore never compare a status against a literal - otherwise an
item handed back to the customer or sent for disposal would still count as an
ongoing repair. Adding a new status in the CRM needs no change here: it is
enough for an admin to assign it a role.
"""

from core.models import PicklistValue

WORKITEM_STATUS_CATEGORY = "workitem_status"

# Roles meaning the case is finished and must not be shown as an ongoing repair.
CLOSED_ROLES = frozenset({"resolved", "cancelled"})


def workitem_status_index(tenant):
    """Map of {status value: PicklistValue} for a tenant.

    One query; callers should pass the result around rather than hitting the
    database for every work item.
    """
    return {
        pv.value: pv
        for pv in PicklistValue.objects.filter(
            tenant=tenant, category=WORKITEM_STATUS_CATEGORY
        )
    }


def is_closed_status(status, index):
    """Whether a status means the case is closed.

    A status unknown to the picklist counts as OPEN. Showing a repair that is
    already finished is recoverable in conversation; staying silent about one
    that is still running is not detectable at all.
    """
    pv = index.get(status)
    if pv is None or not pv.status_role:
        return False
    return pv.status_role in CLOSED_ROLES


def status_label(status, index):
    """Human-facing label for a status.

    The picklist stores a readable name ("Wydane bez naprawy") next to the
    technical value ("wydane_bez_naprawy"); the call screen shows the name.
    """
    pv = index.get(status)
    if pv and pv.name:
        return pv.name
    return status or ""
