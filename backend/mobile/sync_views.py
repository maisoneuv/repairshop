"""Incremental sync of the caller lookup cache.

The phone keeps a local copy of "which number belongs to whom" so that an
incoming call can be resolved without touching the network. This endpoint feeds
that copy: the device asks what changed since its last successful sync and gets
back a minimal projection.

Two deliberate constraints shape the response:

* Only what the call screen needs - number, name, whether anything is open.
  No e-mail, no address. Less on a device that can be lost, less to wipe.
* Rows that stopped being usable (customer deleted, or their number removed)
  come back as tombstones, otherwise the phone would keep answering with data
  the CRM no longer has.
"""

from django.db.models import Exists, OuterRef, Q
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from core.authentication import APIKeyAuthentication
from core.picklists import CLOSED_ROLES, workitem_status_index
from customers.models import Customer
from mobile.authentication import MobileJWTAuthentication
from tasks.models import WorkItem

# A full sync of a couple of thousand customers has to fit in a handful of
# round trips without holding a large queryset in memory on either side.
PAGE_SIZE = 500
MAX_PAGE_SIZE = 2000


class MobileSyncThrottle(UserRateThrottle):
    """Sync runs on a schedule, not per call, so the ceiling can be low."""
    scope = "mobile_sync"


def _serialise(customer, open_ids):
    return {
        "customer_id": customer.id,
        "phone_e164": customer.phone_e164,
        "display_name": customer.full_name(),
        "has_open_work_item": customer.id in open_ids,
        "updated_at": customer.updated_at.isoformat() if customer.updated_at else None,
    }


def _tombstone(customer):
    """A row the device must forget: deleted, or no longer reachable by phone."""
    return {
        "customer_id": customer.id,
        "deleted": True,
        "updated_at": customer.updated_at.isoformat() if customer.updated_at else None,
    }


@api_view(["GET"])
@authentication_classes([SessionAuthentication, APIKeyAuthentication, MobileJWTAuthentication])
@permission_classes([IsAuthenticated])
@throttle_classes([MobileSyncThrottle])
def sync_customers(request):
    """GET /api/mobile/sync/customers?since=<iso8601>&cursor=<id>&limit=<n>

    `since` is the `updated_at` of the newest row the device already holds;
    `cursor` continues a page run within the same `since`. Both are echoed back
    as `next_since` / `next_cursor`, so the client stores one pair and never has
    to reason about paging itself.
    """
    tenant = getattr(request, "tenant", None)
    if tenant is None:
        return Response({"error": "Tenant not resolved"}, status=400)

    since = request.GET.get("since") or None
    cursor = request.GET.get("cursor")
    try:
        limit = min(int(request.GET.get("limit", PAGE_SIZE)), MAX_PAGE_SIZE)
    except ValueError:
        limit = PAGE_SIZE

    qs = Customer.objects.filter(tenant=tenant)
    if since:
        qs = qs.filter(updated_at__gte=since)
    if cursor:
        try:
            qs = qs.filter(id__gt=int(cursor))
        except ValueError:
            return Response({"error": "Invalid cursor"}, status=400)

    # Ordering by id keeps paging stable even when several rows share a
    # timestamp - ordering by updated_at alone could skip or repeat records.
    page = list(qs.order_by("id")[: limit + 1])
    has_more = len(page) > limit
    page = page[:limit]

    if not page:
        return Response({
            "records": [],
            "tombstones": [],
            "has_more": False,
            "next_since": since,
            "next_cursor": None,
        })

    usable = [c for c in page if c.phone_e164]
    dropped = [c for c in page if not c.phone_e164]

    # One query decides "has anything open" for the whole page. Closed statuses
    # come from the tenant's picklist, so a status unknown to it counts as open -
    # consistent with the lookup endpoint.
    status_index = workitem_status_index(tenant)
    closed_values = [
        value for value, pv in status_index.items() if pv.status_role in CLOSED_ROLES
    ]
    open_ids = set(
        WorkItem.objects.filter(tenant=tenant, customer_id__in=[c.id for c in usable])
        .exclude(status__in=closed_values)
        .values_list("customer_id", flat=True)
    )

    last = page[-1]
    return Response({
        "records": [_serialise(c, open_ids) for c in usable],
        "tombstones": [_tombstone(c) for c in dropped],
        "has_more": has_more,
        # While a page run is in progress the device keeps the original `since`
        # and walks ids; once drained it moves `since` forward.
        "next_since": since if has_more else (
            last.updated_at.isoformat() if last.updated_at else since
        ),
        "next_cursor": str(last.id) if has_more else None,
    })
