from .models import Location, LocationType


def get_or_create_customer_location(tenant, customer, address, label=""):
    location = Location.objects.filter(
        tenant=tenant,
        type=LocationType.CUSTOMER_ADDRESS,
        customer=customer,
        address=address,
    ).select_related("customer", "address").first()
    if location:
        return location, False
    location = Location.objects.create(
        tenant=tenant,
        name=label or f"{customer.first_name} {customer.last_name} address",
        type=LocationType.CUSTOMER_ADDRESS,
        customer=customer,
        address=address,
    )
    return location, True


def location_address(location):
    if location is None:
        return None
    return location.address or (location.shop.address if location.shop else None)


def location_city(location):
    address = location_address(location)
    return address.city if address else None
