"""
Customer search service using hybrid search approach
"""
from django.db.models import Q, Count, Prefetch, Case, When, IntegerField, Value
from .models import Customer
from tasks.models import WorkItem


def search_customers(query_string, tenant, limit=5):
    """
    Search customers using a hybrid approach:
    - icontains for phone numbers, emails, and IDs (for partial matches)
    - Full-Text Search for names (for word matching)

    Args:
        query_string: The search query string
        tenant: The tenant object for filtering
        limit: Maximum number of results to return (default 5)

    Returns:
        QuerySet of Customer objects with search ranking and related work items
    """
    if not query_string or len(query_string.strip()) < 2:
        return Customer.objects.none()

    query_string = query_string.strip()

    # Prefetch active work items for each customer (max 3 most recent)
    active_work_items = WorkItem.objects.filter(
        tenant=tenant,
        status__in=['New', 'In Progress']
    ).select_related(
        'customer_asset__device',
        'owner__user',
        'technician__user'
    ).order_by('-created_date')[:3]

    # Build a combined query using Q objects for partial matching
    # This works better for phone numbers, emails, and partial text
    search_filters = Q(
        Q(phone_number__icontains=query_string) |
        Q(email__icontains=query_string) |
        Q(first_name__icontains=query_string) |
        Q(last_name__icontains=query_string) |
        Q(tax_code__icontains=query_string)
    )

    # For better ranking, we can use CASE WHEN to prioritize exact/prefix matches
    customers = Customer.objects.filter(
        tenant=tenant
    ).filter(
        search_filters
    ).annotate(
        # Custom ranking: exact matches score highest, then startswith, then contains
        rank=Case(
            # Exact phone number match
            When(phone_number__iexact=query_string, then=Value(100)),
            # Phone starts with query
            When(phone_number__istartswith=query_string, then=Value(90)),
            # Phone contains query
            When(phone_number__icontains=query_string, then=Value(80)),
            # Exact email match
            When(email__iexact=query_string, then=Value(100)),
            # Email starts with query
            When(email__istartswith=query_string, then=Value(85)),
            # Email contains query
            When(email__icontains=query_string, then=Value(75)),
            # First name starts with query
            When(first_name__istartswith=query_string, then=Value(70)),
            # Last name starts with query
            When(last_name__istartswith=query_string, then=Value(70)),
            # First name contains query
            When(first_name__icontains=query_string, then=Value(60)),
            # Last name contains query
            When(last_name__icontains=query_string, then=Value(60)),
            # Tax code match
            When(tax_code__icontains=query_string, then=Value(50)),
            default=Value(1),
            output_field=IntegerField()
        ),
        active_work_item_count=Count(
            'workitem',
            filter=Q(workitem__status__in=['New', 'In Progress'])
        )
    ).prefetch_related(
        Prefetch('workitem_set', queryset=active_work_items, to_attr='recent_work_items')
    ).order_by('-rank', 'first_name', 'last_name')[:limit]

    return customers


def serialize_customer_search_result(customer):
    """
    Serialize a customer search result with related work items.

    Args:
        customer: Customer object with annotated fields

    Returns:
        Dictionary with customer data and related work items
    """
    from .serializers import CustomerSerializer
    from tasks.serializers import WorkItemSerializer

    customer_data = CustomerSerializer(customer).data

    # Add active work item count
    customer_data['active_work_item_count'] = getattr(customer, 'active_work_item_count', 0)

    # Add recent work items
    recent_work_items = getattr(customer, 'recent_work_items', [])
    customer_data['recent_work_items'] = [
        {
            'id': wi.id,
            'reference_id': wi.reference_id,
            'status': wi.status,
            'description': wi.description[:100] if wi.description else '',
            'created_date': wi.created_date,
            'device_name': f"{wi.customer_asset.device.manufacturer} {wi.customer_asset.device.model}"
                          if wi.customer_asset and wi.customer_asset.device else None,
        }
        for wi in recent_work_items
    ]

    return customer_data
