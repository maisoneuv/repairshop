"""
Turns a bare `Tenant` row into a tenant whose first admin can actually log in
and use the app.

Creating a Tenant by itself only seeds default picklist values (see the
`create_default_picklists` post_save signal in tasks/signals.py). It leaves
the tenant with no Role, no RepairShop/Location, and no user — meaning the
very first Employee can't even be created, since Employee.location is
required. `provision_tenant()` fills in the rest of that object graph in one
transaction so a new tenant is immediately usable.
"""
from django.db import transaction

from core.models import Address, User, UserRole
from core.provisioning import ensure_tenant_admin_role
from service.models import CashRegister, Employee, Location, LocationType, RepairShop


class TenantAlreadyProvisionedError(Exception):
    """Raised when provision_tenant() is called on a tenant that already has a shop."""


@transaction.atomic
def provision_tenant(
    tenant,
    *,
    admin_email,
    admin_password,
    admin_name="",
    shop_name=None,
    street="Main Street",
    building_number="1",
    city=None,
    postal_code="00-000",
    country="Poland",
):
    """Bootstrap a new tenant: Tenant Admin role, default shop/location/cash
    register, and an admin user who can log in and start working immediately.

    Raises TenantAlreadyProvisionedError if the tenant already has a
    RepairShop — this is a one-time bootstrap step, not something to
    re-run. Re-run `create_tenant_admin_role` directly if only permissions
    need to be re-synced on an existing tenant.
    """
    if RepairShop.objects.filter(tenant=tenant).exists():
        raise TenantAlreadyProvisionedError(
            f"Tenant '{tenant}' already has a RepairShop — refusing to provision again."
        )

    role = ensure_tenant_admin_role(tenant)

    address = Address.objects.create(
        street=street,
        building_number=building_number,
        city=city or tenant.name,
        postal_code=postal_code,
        country=country,
    )

    shop = RepairShop.objects.create(
        tenant=tenant,
        name=shop_name or f"{tenant.name} Shop",
        address=address,
    )

    location = Location.objects.create(
        tenant=tenant,
        name="Main location",
        type=LocationType.SHOP,
        shop=shop,
    )
    location.full_clean()

    cash_register = CashRegister.objects.create(
        tenant=tenant,
        shop=shop,
        name="Main till",
    )

    admin_user = User.objects.create_user(
        email=admin_email,
        password=admin_password,
        tenant=tenant,
        name=admin_name,
    )

    employee = Employee.objects.create(
        tenant=tenant,
        user=admin_user,
        role="Manager",
        location=location,
    )

    UserRole.objects.get_or_create(user=admin_user, role=role)

    return {
        "role": role,
        "address": address,
        "shop": shop,
        "location": location,
        "cash_register": cash_register,
        "admin_user": admin_user,
        "employee": employee,
    }
