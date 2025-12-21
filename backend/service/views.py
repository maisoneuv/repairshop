# employees/views.py
from django.contrib.auth.models import Permission
from django_filters.rest_framework import DjangoFilterBackend
from collections import OrderedDict

from rest_framework.exceptions import PermissionDenied, NotFound, ValidationError
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.viewsets import ModelViewSet

from core.mixins import TenantScopedMixin
from core.models import UserRole
from core.serializers import UserSerializer
from core.views import GenericSearchView
from .models import Employee, Location, RepairShop
from customers.models import Customer
from .serializers import EmployeeSerializer, CurrentEmployeeSerializer, LocationSerializer, ShopSerializer
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import filters, status
from rest_framework.decorators import api_view, permission_classes
from core.models import Address


class EmployeeSearchView(GenericSearchView):
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['user__first_name', 'user__last_name', 'user__email']

    def get_queryset(self):
        user = self.request.user

        if user.is_superuser:
            return Employee.objects.select_related('user').all()

        if not self.request.tenant:
            return Employee.objects.none()

        if not user.has_permission('view_all_employees', self.request.tenant):
            return Employee.objects.none()

        return Employee.objects.select_related('user').filter(tenant=self.request.tenant)


class ShopSearchView(GenericSearchView):
    serializer_class = ShopSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['name', 'contact_email', 'contact_phone']

    def get_queryset(self):
        if not self.request.tenant:
            return RepairShop.objects.none()

        return RepairShop.objects.filter(tenant=self.request.tenant).select_related('address')


class EmployeeListView(APIView):
    """Returns all employees for the tenant (for picklist dropdown)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if user.is_superuser:
            queryset = Employee.objects.select_related('user').all()
        elif not request.tenant:
            return Response([], status=status.HTTP_200_OK)
        elif not user.has_permission('view_all_employees', request.tenant):
            return Response([], status=status.HTTP_200_OK)
        else:
            queryset = Employee.objects.select_related('user').filter(tenant=request.tenant)

        serializer = EmployeeSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class LocationSearchView(GenericSearchView):
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]
    search_fields = ['name']

    def get_queryset(self):
        if not self.request.tenant:
            return Location.objects.none()
        return Location.objects.filter(tenant=self.request.tenant).select_related('shop', 'customer', 'address')

    def list(self, request, *args, **kwargs):
        query = (request.GET.get('q') or '').strip()
        customer_id = request.GET.get('customer_id', None)

        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return Response({"groups": []})

        groups = OrderedDict([
            ("Shops", []),
            ("Customer Addresses", []),
            ("Other", []),
        ])

        def add_item(label, item, prepend=False):
            # Skip empty labels to keep consistent order
            if label not in groups:
                groups[label] = []
            bucket = groups[label]
            # Ensure every option is unique by id to avoid duplicates
            if any(str(existing.get("id")) == str(item.get("id")) for existing in bucket):
                return
            if prepend:
                bucket.insert(0, item)
            else:
                bucket.append(item)

        def serialize_location(location, extra=None):
            data = {
                "id": location.id,
                "name": location.name,
                "type": location.type,
                "address": str(location.address) if location.address else "",
                "address_id": location.address_id,
                "shop_name": location.shop.name if location.shop else "",
                "customer_name": (
                    f"{location.customer.first_name} {location.customer.last_name}"
                    if location.customer else ""
                ),
            }
            if extra:
                data.update(extra)
            return data

        # Attempt to load the selected customer (for primary address option)
        customer_obj = None
        if customer_id:
            try:
                customer_obj = Customer.objects.select_related('address').get(
                    id=customer_id,
                    tenant=tenant,
                )
            except (Customer.DoesNotExist, ValueError, TypeError):
                customer_obj = None

        # Surface the customer's primary address even if it is not yet a location
        if customer_obj and customer_obj.address_id:
            existing_primary = (
                Location.objects.filter(
                    tenant=tenant,
                    type='customer',
                    customer_id=customer_obj.id,
                    address_id=customer_obj.address_id,
                )
                .select_related('customer', 'address')
                .first()
            )

            if existing_primary:
                add_item(
                    "Customer Addresses",
                    serialize_location(
                        existing_primary,
                        {"from_customer": True, "is_primary_customer_address": True},
                    ),
                    prepend=True,
                )
            else:
                add_item(
                    "Customer Addresses",
                    {
                        "id": f"customer-address-{customer_obj.id}",
                        "name": "Primary Address",
                        "type": "customer_primary_address",
                        "address": str(customer_obj.address),
                        "customer_name": f"{customer_obj.first_name} {customer_obj.last_name}",
                        "customer_id": customer_obj.id,
                        "address_id": customer_obj.address_id,
                        "source": "customer_address",
                    },
                    prepend=True,
                )

        # Always surface the current employee location (if any)
        if request.user.is_authenticated:
            employee = (
                Employee.objects.select_related(
                    'location__address', 'location__shop', 'location__customer'
                )
                .filter(user=request.user, tenant=tenant)
                .first()
            )
            if employee and employee.location:
                assigned_location = employee.location
                target_group = {
                    'shop': 'Shops',
                    'customer': 'Customer Addresses',
                    'freeform': 'Other',
                }.get(assigned_location.type, 'Other')
                add_item(
                    target_group,
                    serialize_location(assigned_location, {"is_assigned": True}),
                    prepend=True,
                )

        # Surface the customer's primary address even if it is not yet a location
        primary_customer_location = None
        if customer_obj and customer_obj.address_id:
            primary_customer_location = (
                Location.objects.filter(
                    tenant=tenant,
                    type='customer',
                    customer_id=customer_obj.id,
                    address_id=customer_obj.address_id,
                )
                .select_related('customer', 'address')
                .first()
            )

            if primary_customer_location:
                add_item(
                    "Customer Addresses",
                    serialize_location(
                        primary_customer_location,
                        {"from_customer": True, "is_primary_customer_address": True},
                    ),
                    prepend=True,
                )
            else:
                add_item(
                    "Customer Addresses",
                    {
                        "id": f"customer-address-{customer_obj.id}",
                        "name": "Primary Address",
                        "type": "customer_primary_address",
                        "address": str(customer_obj.address),
                        "customer_name": f"{customer_obj.first_name} {customer_obj.last_name}",
                        "customer_id": customer_obj.id,
                        "address_id": customer_obj.address_id,
                        "source": "customer_address",
                    },
                    prepend=True,
                )

        # Customer saved addresses
        if customer_id:
            try:
                customer_qs = Location.objects.filter(
                    tenant=tenant,
                    type='customer',
                    customer_id=customer_id,
                ).select_related('customer', 'address')

                if primary_customer_location:
                    customer_qs = customer_qs.exclude(address_id=customer_obj.address_id)

                customer_locations = customer_qs.order_by('name')[:10]

                for location in customer_locations:
                    add_item(
                        "Customer Addresses",
                        serialize_location(location, {"from_customer": True}),
                    )
            except (ValueError, TypeError):
                pass  # Invalid customer id

        perform_search = bool(query) and len(query) >= 2

        if perform_search:
            shop_locations = (
                Location.objects.filter(
                    tenant=tenant,
                    type='shop',
                    name__icontains=query,
                )
                .select_related('shop', 'address')[:10]
            )

            for location in shop_locations:
                add_item("Shops", serialize_location(location))

            if customer_id:
                try:
                    matched_customer_qs = Location.objects.filter(
                            tenant=tenant,
                            type='customer',
                            customer_id=customer_id,
                            name__icontains=query,
                        ).select_related('customer', 'address')

                    if customer_obj and customer_obj.address_id:
                        matched_customer_qs = matched_customer_qs.exclude(address_id=customer_obj.address_id)

                    matched_customer_locations = matched_customer_qs[:10]

                    for location in matched_customer_locations:
                        add_item(
                            "Customer Addresses",
                            serialize_location(location, {"from_customer": True}),
                        )
                except (ValueError, TypeError):
                    pass

            other_locations = (
                Location.objects.filter(
                    tenant=tenant,
                    type='freeform',
                    name__icontains=query,
                )
                .select_related('address')[:10]
            )

            for location in other_locations:
                add_item("Other", serialize_location(location))

        # Always expose "Other address..." action
        add_item(
            "Other",
            {"id": "new", "name": "Other address...", "type": "new", "address": ""},
        )

        # Remove empty groups except "Other" so UI stays tidy
        response_groups = [
            {"label": label, "items": items}
            for label, items in groups.items()
            if items or label == "Other"
        ]

        return Response({"groups": response_groups})


class LocationViewSet(TenantScopedMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = LocationSerializer
    queryset = Location.objects.all()

    def get_queryset(self):
        return (super().get_queryset()
                .select_related("shop", "address", "customer"))


class CurrentEmployeeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if not request.tenant:
            return Response({"detail": "Tenant header missing or invalid."}, status=400)

        tenant = request.tenant

        # Superusers can see all
        # if user.is_superuser:
        #     # Superusers don't *have* an Employee in every tenant
        #     # Return partial info
        #     all_tenants = list(
        #         UserRole.objects.filter(user=user)
        #         .select_related('role__tenant')
        #         .values_list('role__tenant__subdomain', flat=True)
        #         .distinct()
        #     )
        #     return Response({
        #         "user": UserSerializer(user).data,
        #         "employee": None,
        #         "availableTenants": all_tenants,
        #         "currentTenant": tenant.subdomain,
        #         "permissions": list(Permission.objects.values_list('codename', flat=True)),
        #     })

        # Get this user's Employee profile in this tenant
        try:
            employee = Employee.objects.select_related('user', 'location').get(user=user) #todo add tenant filtering
        except Employee.DoesNotExist:
            raise NotFound("Employee profile not found in this tenant.")

        # List all tenants this user belongs to
        user_tenants = UserRole.objects.filter(user=user)\
            .select_related('role__tenant')\
            .values_list('role__tenant__id', 'role__tenant__subdomain', 'role__tenant__name')\
            .distinct()

        availableTenants = [
            {"subdomain": subdomain, "name": name} for subdomain, name in user_tenants
        ]

        # Find all permissions for this user in this tenant
        permissions = Permission.objects.filter(
            rolepermission__role__user_roles__user=user,
            rolepermission__role__tenant=tenant
        ).distinct().values_list('codename', flat=True)

        data = {
            "user": UserSerializer(employee.user).data,
            "employee": {
                "id": employee.id,
                "location_id": employee.location.id if employee.location else None,
                "location_name": employee.location.name if employee.location else None,
                "role": employee.get_role_display() if hasattr(employee, 'role') else None,
            },
            "availableTenants": [
                {"id": t["role__tenant__id"], "subdomain": t["role__tenant__subdomain"], "name": t["role__tenant__name"]}
                for t in availableTenants
            ],
            "currentTenant": {
                "id": tenant.id,
                "subdomain": tenant.subdomain,
                "name": tenant.name,
            },
            "permissions": list(permissions),
        }

        return Response(data)

class ShopViewSet(TenantScopedMixin, ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ShopSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    # allow ?type=partner&active=true
    filterset_fields = {"type": ["exact"], "active": ["exact"]}
    search_fields = ["name", "contact_email", "contact_phone"]
    ordering_fields = ["name", "active", "id"]
    ordering = ["name"]

    def get_queryset(self):
        return (super().get_queryset()
                .select_related("address"))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_freeform_location(request):
    """
    Create a new freeform location from address data.
    Supports optional customer association.
    """
    if not request.tenant:
        return Response({"detail": "Tenant header missing or invalid."}, status=400)

    data = request.data
    required_fields = ['street', 'building_number', 'city', 'postal_code', 'country']

    # Validate required fields
    for field in required_fields:
        if not data.get(field, '').strip():
            return Response({
                "detail": f"{field.replace('_', ' ').title()} is required"
            }, status=400)

    try:
        # Create the address
        address = Address.objects.create(
            street=data['street'].strip(),
            building_number=data['building_number'].strip(),
            city=data['city'].strip(),
            postal_code=data['postal_code'].strip(),
            country=data['country'].strip(),
            apartment_number=data.get('apartment_number', '').strip() or None
        )

        # Create the location
        label = data.get('label', '').strip()
        if not label:
            label = f"{address.street} {address.building_number}"

        location = Location.objects.create(
            tenant=request.tenant,
            name=label,
            type='freeform',
            address=address
        )

        # If save_to_customer is enabled and customer_id provided, create customer address location
        if data.get('save_to_customer') and data.get('customer_id'):
            try:
                from customers.models import Customer
                customer = Customer.objects.get(id=data['customer_id'], tenant=request.tenant)

                # Create a customer address location as well
                customer_location = Location.objects.create(
                    tenant=request.tenant,
                    name=f"{customer.first_name} {customer.last_name} - {label}",
                    type='customer',
                    customer=customer,
                    address=address
                )
            except Customer.DoesNotExist:
                pass  # Customer not found, just ignore the save_to_customer option

        # Return the created location
        serializer = LocationSerializer(location)
        return Response({
            "id": location.id,
            "name": location.name,
            "type": location.type,
            "address": str(address)
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response({
            "detail": f"Error creating location: {str(e)}"
        }, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ensure_customer_address_location(request):
    """Ensure a customer address has a corresponding Location record."""
    if not request.tenant:
        return Response({"detail": "Tenant header missing or invalid."}, status=400)

    customer_id = request.data.get('customer_id')
    address_id = request.data.get('address_id')
    label = (request.data.get('label') or '').strip()

    if not customer_id or not address_id:
        return Response({"detail": "customer_id and address_id are required"}, status=400)

    try:
        customer = Customer.objects.get(id=customer_id, tenant=request.tenant)
    except (Customer.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "Customer not found"}, status=404)

    try:
        address = Address.objects.get(id=address_id)
    except (Address.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "Address not found"}, status=404)

    location = Location.objects.filter(
        tenant=request.tenant,
        type='customer',
        customer=customer,
        address=address,
    ).select_related('customer', 'address').first()

    created = False
    if not location:
        display_name = label or f"{customer.first_name} {customer.last_name} address"
        location = Location.objects.create(
            tenant=request.tenant,
            name=display_name,
            type='customer',
            customer=customer,
            address=address,
        )
        created = True

    payload = {
        "id": location.id,
        "name": location.name,
        "type": location.type,
        "address": str(location.address) if location.address else "",
        "customer_name": f"{customer.first_name} {customer.last_name}",
        "customer_id": customer.id,
        "address_id": address.id,
    }

    status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return Response(payload, status=status_code)
