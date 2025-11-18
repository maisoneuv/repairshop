"""
Work Item search service using hybrid search approach
"""
from django.db.models import Q
from .models import WorkItem


def search_work_items(query_string, tenant, user, limit=5):
    """
    Search work items using a hybrid approach for better partial matching.

    Args:
        query_string: The search query string
        tenant: The tenant object for filtering
        user: The requesting user for permission filtering
        limit: Maximum number of results to return (default 5)

    Returns:
        QuerySet of WorkItem objects with search ranking
    """
    if not query_string or len(query_string.strip()) < 2:
        return WorkItem.objects.none()

    query_string = query_string.strip()

    # Base queryset with relationships
    queryset = WorkItem.objects.filter(
        tenant=tenant
    ).select_related(
        'customer',
        'customer_asset__device',
        'owner__user',
        'technician__user',
        'dropoff_point',
        'pickup_point',
        'fulfillment_shop'
    )

    # Apply permission filtering
    # Check if user has permission to view all work items
    if not user.has_perm('tasks.view_all_workitems'):
        # User can only see work items they own or are assigned to
        if hasattr(user, 'employee') and user.employee:
            queryset = queryset.filter(
                Q(owner=user.employee) | Q(technician=user.employee)
            )
        else:
            # User has no employee record, return empty
            return WorkItem.objects.none()

    # Build search filters using Q objects for partial matching
    search_filters = Q(
        Q(reference_id__icontains=query_string) |
        Q(description__icontains=query_string) |
        Q(customer__phone_number__icontains=query_string) |
        Q(customer__email__icontains=query_string) |
        Q(customer__first_name__icontains=query_string) |
        Q(customer__last_name__icontains=query_string) |
        Q(device_condition__icontains=query_string) |
        Q(accessories__icontains=query_string) |
        Q(customer_asset__serial_number__icontains=query_string) |
        Q(customer_asset__device__model__icontains=query_string) |
        Q(customer_asset__device__manufacturer__icontains=query_string)
    )

    # Custom ranking for better relevance
    from django.db.models import Case, When, IntegerField, Value

    work_items = queryset.filter(
        search_filters
    ).annotate(
        rank=Case(
            # Reference ID exact match (highest priority)
            When(reference_id__iexact=query_string, then=Value(100)),
            # Reference ID starts with query
            When(reference_id__istartswith=query_string, then=Value(95)),
            # Reference ID contains query
            When(reference_id__icontains=query_string, then=Value(90)),
            # Customer phone exact match
            When(customer__phone_number__iexact=query_string, then=Value(85)),
            # Customer phone starts with query
            When(customer__phone_number__istartswith=query_string, then=Value(80)),
            # Customer phone contains query
            When(customer__phone_number__icontains=query_string, then=Value(75)),
            # Device model starts with query
            When(customer_asset__device__model__istartswith=query_string, then=Value(70)),
            # Device manufacturer starts with query
            When(customer_asset__device__manufacturer__istartswith=query_string, then=Value(70)),
            # Serial number match
            When(customer_asset__serial_number__icontains=query_string, then=Value(65)),
            # Customer name matches
            When(customer__first_name__istartswith=query_string, then=Value(60)),
            When(customer__last_name__istartswith=query_string, then=Value(60)),
            # Description contains query
            When(description__icontains=query_string, then=Value(50)),
            # Other fields
            When(device_condition__icontains=query_string, then=Value(40)),
            When(accessories__icontains=query_string, then=Value(30)),
            default=Value(1),
            output_field=IntegerField()
        )
    ).order_by('-rank', '-created_date')[:limit]

    return work_items


def serialize_work_item_search_result(work_item):
    """
    Serialize a work item search result with related data.

    Args:
        work_item: WorkItem object

    Returns:
        Dictionary with work item data
    """
    result = {
        'id': work_item.id,
        'reference_id': work_item.reference_id,
        'status': work_item.status,
        'description': work_item.description[:150] if work_item.description else '',
        'created_date': work_item.created_date,
        'due_date': work_item.due_date,
        'priority': work_item.priority,
        'type': work_item.type,
        'customer': {
            'id': work_item.customer.id,
            'first_name': work_item.customer.first_name,
            'last_name': work_item.customer.last_name,
            'email': work_item.customer.email,
            'phone_number': work_item.customer.phone_number,
        } if work_item.customer else None,
        'device_name': None,
        'device_info': None,
        'owner': {
            'id': work_item.owner.id,
            'name': f"{work_item.owner.user.first_name} {work_item.owner.user.last_name}".strip(),
        } if work_item.owner else None,
        'technician': {
            'id': work_item.technician.id,
            'name': f"{work_item.technician.user.first_name} {work_item.technician.user.last_name}".strip(),
        } if work_item.technician else None,
    }

    # Add device information if available
    if work_item.customer_asset and work_item.customer_asset.device:
        device = work_item.customer_asset.device
        result['device_name'] = f"{device.manufacturer} {device.model}".strip()
        result['device_info'] = {
            'manufacturer': device.manufacturer,
            'model': device.model,
            'serial_number': work_item.customer_asset.serial_number,
        }

    return result
