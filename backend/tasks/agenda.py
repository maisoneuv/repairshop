from appointments.models import OPEN_STATUSES, Appointment, AppointmentStatus

from .models import Task, WorkItem

MAX_RANGE_DAYS = 62
MAX_CARRIED_OVER = 50


def _name(first, last):
    return " ".join(filter(None, [first, last])).strip()


def _time(value):
    return value.strftime("%H:%M") if value else None


def _address_line(street, building, city):
    return ", ".join(filter(None, [" ".join(filter(None, [street, building])), city]))


def _appointments(tenant, employee):
    qs = Appointment.objects.filter(tenant=tenant).exclude(status=AppointmentStatus.CANCELLED)
    return qs.filter(route__driver=employee) if employee else qs


def _tasks(tenant, employee):
    qs = Task.objects.filter(tenant=tenant)
    return qs.filter(assigned_employee=employee) if employee else qs


def _work_items(tenant, employee):
    qs = WorkItem.objects.filter(tenant=tenant)
    return qs.filter(technician=employee) if employee else qs


def _appointment_events(qs, limit=None):
    qs = (
        qs.select_related("address", "route__driver__user", "work_item")
        .order_by("route__date", "stop_order", "arrival_window_start", "id")
    )[:limit]

    events = []
    for apt in qs:
        driver = apt.route.driver
        events.append({
            "kind": "appointment",
            "id": apt.id,
            "date": apt.route.date.isoformat(),
            "start_time": _time(apt.arrival_window_start),
            "end_time": _time(apt.arrival_window_end),
            "stop_order": apt.stop_order,
            "type": apt.type,
            "reference_id": apt.reference_id,
            "title": apt.full_name(),
            "subtitle": _address_line(apt.address.street, apt.address.building_number, apt.address.city),
            "status": apt.status,
            "done": apt.status == AppointmentStatus.COMPLETED,
            "assignee": {"id": driver.id, "name": str(driver)} if driver else None,
            "work_item_id": apt.work_item_id,
            "work_item_reference_id": apt.work_item.reference_id if apt.work_item else None,
        })
    return events


def _first_line(text):
    return (text or "").strip().splitlines()[0].strip() if (text or "").strip() else ""


def _task_events(qs, limit=None):
    qs = qs.order_by("due_date", "id")
    events = []
    for row in qs.values(
        "id", "reference_id", "summary", "status", "due_date", "task_type__name",
        "work_item_id", "work_item__reference_id", "assigned_employee_id",
        "assigned_employee__user__first_name", "assigned_employee__user__last_name",
    )[:limit]:
        summary = _first_line(row["summary"])
        task_type = row["task_type__name"]
        events.append({
            "kind": "task",
            "id": row["id"],
            "date": row["due_date"].isoformat(),
            "reference_id": row["reference_id"],
            "title": summary or task_type or row["reference_id"] or f"Task #{row['id']}",
            "subtitle": " · ".join(filter(None, [task_type if summary else None, row["work_item__reference_id"]])) or None,
            "task_type": task_type,
            "status": row["status"],
            "done": row["status"] == "Done",
            "assignee": {
                "id": row["assigned_employee_id"],
                "name": _name(row["assigned_employee__user__first_name"], row["assigned_employee__user__last_name"]),
            },
            "work_item_id": row["work_item_id"],
        })
    return events


def _work_item_events(qs, limit=None):
    qs = qs.order_by("due_date", "id")

    return [
        {
            "kind": "work_item",
            "id": row["id"],
            "date": row["due_date"].isoformat(),
            "reference_id": row["reference_id"],
            "title": _name(row["customer__first_name"], row["customer__last_name"]) or row["reference_id"],
            "subtitle": " ".join(filter(None, [
                row["customer_asset__device__manufacturer"], row["customer_asset__device__model"],
            ])) or None,
            "status": row["status"],
            "done": row["closed_date"] is not None,
            "assignee": {
                "id": row["technician_id"],
                "name": _name(row["technician__user__first_name"], row["technician__user__last_name"]),
            } if row["technician_id"] else None,
            "work_item_id": row["id"],
        }
        for row in qs.values(
            "id", "reference_id", "status", "due_date", "closed_date",
            "customer__first_name", "customer__last_name", "customer_asset__device__manufacturer",
            "customer_asset__device__model",
            "technician_id", "technician__user__first_name", "technician__user__last_name",
        )[:limit]
    ]


def build_agenda(tenant, employee, date_from, date_to):
    """`employee=None` means everyone in the tenant."""
    events = (
        _appointment_events(_appointments(tenant, employee).filter(route__date__range=(date_from, date_to)))
        + _task_events(_tasks(tenant, employee).filter(due_date__range=(date_from, date_to)))
        + _work_item_events(_work_items(tenant, employee).filter(due_date__range=(date_from, date_to)))
    )
    unscheduled = Appointment.objects.filter(tenant=tenant, status__in=OPEN_STATUSES).count()
    return {"events": events, "unscheduled_count": unscheduled}


def build_carried_over(tenant, employee, today):
    """Unfinished items from before `today`. "Not home" stops are left out:
    they already count as waiting to be scheduled."""
    appointments = _appointments(tenant, employee).filter(
        route__date__lt=today, status=AppointmentStatus.SCHEDULED,
    )
    tasks = _tasks(tenant, employee).filter(due_date__lt=today).exclude(status="Done")
    work_items = _work_items(tenant, employee).filter(due_date__lt=today, closed_date__isnull=True)
    total = appointments.count() + tasks.count() + work_items.count()
    events = (
        _appointment_events(appointments, MAX_CARRIED_OVER)
        + _task_events(tasks, MAX_CARRIED_OVER)
        + _work_item_events(work_items, MAX_CARRIED_OVER)
    )
    return {"items": events[:MAX_CARRIED_OVER], "total": total}
