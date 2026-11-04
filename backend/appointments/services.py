from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from core.models import Note
from customers.models import Customer
from customers.services import match_or_create_customer
from service.locations import get_or_create_customer_location, location_address
from service.models import Employee
from tasks.models import MoveMethod

from .models import Appointment, AppointmentStatus, AppointmentType, Route

ALLOWED_TRANSITIONS = {
    AppointmentStatus.NEW: {AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED},
    AppointmentStatus.SCHEDULED: {
        AppointmentStatus.NEW, AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED,
        AppointmentStatus.FAILED, AppointmentStatus.CANCELLED,
    },
    AppointmentStatus.FAILED: {
        AppointmentStatus.NEW, AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED,
    },
    AppointmentStatus.COMPLETED: set(),
    AppointmentStatus.CANCELLED: set(),
}


def _require_transition(appointment, target):
    if target not in ALLOWED_TRANSITIONS[appointment.status]:
        raise ValidationError(
            {"status": f"Cannot change a {appointment.get_status_display().lower()} appointment to {target}."}
        )


def drivers_for(tenant):
    return Employee.objects.filter(tenant=tenant, is_driver=True).select_related("user", "location")


def driver_shop_address(driver):
    return location_address(driver.location) if driver else None


def default_endpoints(driver):
    """Start from the driver's home when set, and always finish at their shop,
    where the collected devices have to end up."""
    shop = driver_shop_address(driver)
    return (driver.home_address if driver and driver.home_address_id else shop), shop


def adopt_unassigned_routes(tenant):
    """With exactly one driver, routes planned before any driver was set
    become theirs, except on days where they already have a route."""
    drivers = list(drivers_for(tenant)[:2])
    if len(drivers) != 1:
        return 0
    driver = drivers[0]
    taken = Route.objects.filter(tenant=tenant, driver=driver).values("date")
    unassigned = Route.objects.filter(
        tenant=tenant, driver__isnull=True, date__gte=timezone.localdate(),
    ).exclude(date__in=taken)
    start, end = default_endpoints(driver)
    adopted = 0
    for route in unassigned:
        route.driver = driver
        route.start_address = route.start_address or start
        route.end_address = route.end_address or end
        route.save(update_fields=["driver", "start_address", "end_address"])
        adopted += 1
    return adopted


def get_or_create_route(tenant, date, driver=None):
    if driver is None:
        drivers = list(drivers_for(tenant)[:2])
        if len(drivers) == 1:
            driver = drivers[0]
    start, end = default_endpoints(driver)
    route, _ = Route.objects.get_or_create(
        tenant=tenant, date=date, driver=driver, defaults={"start_address": start, "end_address": end},
    )
    return route


def _renumber(route):
    if route is None:
        return
    stops = route.appointments.exclude(status=AppointmentStatus.CANCELLED).order_by("stop_order", "id")
    for index, stop in enumerate(stops, start=1):
        if stop.stop_order != index:
            Appointment.objects.filter(pk=stop.pk).update(stop_order=index)


@transaction.atomic
def schedule(appointment, route, position=None):
    _require_transition(appointment, AppointmentStatus.SCHEDULED)
    previous_route = appointment.route
    others = list(
        route.appointments.exclude(pk=appointment.pk)
        .exclude(status=AppointmentStatus.CANCELLED)
        .order_by("stop_order", "id")
    )
    if position is None or position > len(others):
        position = len(others)
    others.insert(max(position, 0), appointment)

    appointment.route = route
    appointment.status = AppointmentStatus.SCHEDULED
    appointment.save(update_fields=["route", "status", "updated_at"])
    for index, stop in enumerate(others, start=1):
        Appointment.objects.filter(pk=stop.pk).update(stop_order=index)
    if previous_route and previous_route.pk != route.pk:
        _renumber(previous_route)
    appointment.refresh_from_db()
    return appointment


@transaction.atomic
def unschedule(appointment):
    _require_transition(appointment, AppointmentStatus.NEW)
    previous_route = appointment.route
    appointment.route = None
    appointment.stop_order = None
    appointment.status = AppointmentStatus.NEW
    appointment.save(update_fields=["route", "stop_order", "status", "updated_at"])
    _renumber(previous_route)
    return appointment


@transaction.atomic
def reorder(route, appointment_ids):
    stops = {a.pk: a for a in route.appointments.exclude(status=AppointmentStatus.CANCELLED)}
    if set(appointment_ids) != set(stops):
        raise ValidationError({"appointment_ids": "Send every stop on this route exactly once."})
    for index, pk in enumerate(appointment_ids, start=1):
        Appointment.objects.filter(pk=pk).update(stop_order=index)


def mark_failed(appointment, reason=""):
    _require_transition(appointment, AppointmentStatus.FAILED)
    appointment.status = AppointmentStatus.FAILED
    appointment.failure_reason = reason
    appointment.attempts += 1
    appointment.save(update_fields=["status", "failure_reason", "attempts", "updated_at"])
    return appointment


@transaction.atomic
def cancel(appointment):
    _require_transition(appointment, AppointmentStatus.CANCELLED)
    route = appointment.route
    appointment.status = AppointmentStatus.CANCELLED
    appointment.stop_order = None
    appointment.save(update_fields=["status", "stop_order", "updated_at"])
    _renumber(route)
    return appointment


def _note(work_item, user, content):
    Note.objects.create(author=user, content=content, content_object=work_item)


def _resolve_customer(appointment):
    if appointment.customer:
        return appointment.customer
    # Customer.address is one-to-one, so only hand over an address no one owns.
    address_free = not Customer.objects.filter(address=appointment.address).exists()
    customer, _ = match_or_create_customer(
        appointment.tenant,
        first_name=appointment.first_name,
        last_name=appointment.last_name,
        email=appointment.email,
        prefix=appointment.prefix,
        phone_number=appointment.phone_number,
        address=appointment.address if address_free else None,
    )
    return customer


def _work_item_description(appointment):
    parts = []
    if appointment.device_description:
        parts.append(f"Device: {appointment.device_description}")
    if appointment.issue_description:
        parts.append(f"Issue: {appointment.issue_description}")
    return "\n".join(parts) or f"Picked up from customer ({appointment.reference_id})"


def _dropoff_location(appointment, request):
    if appointment.route and appointment.route.driver_id:
        return appointment.route.driver.location
    employee = Employee.objects.filter(user=request.user, tenant=appointment.tenant).select_related("location").first()
    if employee is None:
        raise ValidationError({"detail": "Assign a driver to the route: your user has no employee record."})
    return employee.location


@transaction.atomic
def complete_pickup(appointment, request):
    from tasks.serializers import WorkItemSerializer

    tenant = appointment.tenant
    if not request.user.has_permission("tasks.add_workitem", tenant):
        raise PermissionDenied("You do not have permission to create a work item.")
    _require_transition(appointment, AppointmentStatus.COMPLETED)

    customer = _resolve_customer(appointment)
    pickup_point, _ = get_or_create_customer_location(tenant, customer, appointment.address)
    dropoff_point = _dropoff_location(appointment, request)

    serializer = WorkItemSerializer(
        data={
            "customer": customer.pk,
            "description": _work_item_description(appointment),
            "pickup_point": pickup_point.pk,
            "dropoff_point": dropoff_point.pk,
            "intake_method": MoveMethod.DRIVER,
        },
        context={"request": request, "tenant": tenant},
    )
    serializer.is_valid(raise_exception=True)
    work_item = serializer.save(tenant=tenant)
    _note(work_item, request.user, f"Created from appointment {appointment.reference_id} (picked up from the customer).")

    if appointment.lead and appointment.lead.status != "converted":
        appointment.lead.status = "converted"
        appointment.lead.save(update_fields=["status"])

    appointment.customer = customer
    appointment.work_item = work_item
    appointment.status = AppointmentStatus.COMPLETED
    appointment.completed_at = timezone.now()
    appointment.save(update_fields=["customer", "work_item", "status", "completed_at", "updated_at"])
    return work_item


@transaction.atomic
def complete_return(appointment, request):
    tenant = appointment.tenant
    if not request.user.has_permission("tasks.change_workitem", tenant):
        raise PermissionDenied("You do not have permission to change work items.")
    _require_transition(appointment, AppointmentStatus.COMPLETED)
    work_item = appointment.work_item
    if work_item is None:
        raise ValidationError({"work_item": "A return delivery must be linked to a work item."})

    work_item.dropoff_method = MoveMethod.DRIVER
    work_item.save(update_fields=["dropoff_method", "updated_date", "updated_at"])
    _note(work_item, request.user, f"Delivered to the customer ({appointment.reference_id}).")

    appointment.status = AppointmentStatus.COMPLETED
    appointment.completed_at = timezone.now()
    appointment.save(update_fields=["status", "completed_at", "updated_at"])
    return work_item


def complete(appointment, request):
    if appointment.type == AppointmentType.RETURN_DELIVERY:
        return complete_return(appointment, request)
    return complete_pickup(appointment, request)
