from datetime import date, time

from django.contrib.auth.models import Permission
from django.test import TestCase
from rest_framework.test import APIClient

from appointments.models import Appointment, AppointmentStatus, AppointmentType, Route
from core.models import Address, Role, RolePermission, User, UserRole
from customers.models import Customer
from service.models import Employee, Location, RepairShop
from tenants.models import Tenant

from .models import Task, TaskType, WorkItem

URL = "/api/tasks/agenda/"
DAY = date(2026, 11, 4)


def _address():
    return Address.objects.create(street="Długa", building_number="5", city="Kraków", postal_code="31-147")


def build_tenant(letter):
    tenant = Tenant.objects.create(name=f"Tenant {letter}", subdomain=f"agenda-{letter}")
    shop = RepairShop.objects.create(tenant=tenant, name=f"Shop {letter}", address=_address())
    location = Location.objects.create(tenant=tenant, name=f"Shop {letter}", type="shop", shop=shop)
    customer = Customer.objects.create(tenant=tenant, first_name="Jan", last_name="Kowalski", email=f"jan-{letter}@example.com")
    return tenant, location, customer


def make_employee(tenant, location, name, *, view_all=False):
    user = User.objects.create_user(
        username=f"{name}-{tenant.subdomain}@example.com", email=f"{name}-{tenant.subdomain}@example.com",
        password="pw", tenant=tenant, first_name=name.title(),
    )
    if view_all:
        role = Role.objects.create(name=f"Manager {name}", tenant=tenant)
        perm = Permission.objects.get(content_type__app_label="tasks", codename="view_all_tasks")
        RolePermission.objects.create(role=role, permission=perm)
        UserRole.objects.create(user=user, role=role)
    return Employee.objects.create(tenant=tenant, user=user, role="Technician", location=location)


class AgendaTests(TestCase):
    def setUp(self):
        self.tenant, self.location, self.customer = build_tenant("a")
        self.me = make_employee(self.tenant, self.location, "me")
        self.other = make_employee(self.tenant, self.location, "other")
        self.manager = make_employee(self.tenant, self.location, "boss", view_all=True)
        self.client = APIClient()
        self.client.force_authenticate(self.me.user)

    def get(self, as_employee=None, tenant=None, **params):
        if as_employee:
            self.client.force_authenticate(as_employee.user)
        params = {"date_from": DAY.isoformat(), "date_to": DAY.isoformat(), **params}
        return self.client.get(URL, params, HTTP_X_TENANT=(tenant or self.tenant).subdomain)

    def task(self, employee, due=DAY, **kw):
        return Task.objects.create(tenant=self.tenant, assigned_employee=employee, due_date=due, summary="Fix", **kw)

    def work_item(self, technician, due=DAY):
        return WorkItem.objects.create(
            tenant=self.tenant, description="x", customer=self.customer, owner=technician,
            technician=technician, dropoff_point=self.location, due_date=due,
        )

    def appointment(self, driver, day=DAY, **kw):
        route, _ = Route.objects.get_or_create(tenant=self.tenant, date=day, driver=driver)
        kw.setdefault("status", AppointmentStatus.SCHEDULED)
        return Appointment.objects.create(tenant=self.tenant, address=_address(), first_name="Anna", route=route, **kw)

    def kinds(self, response):
        return sorted((e["kind"], e["id"]) for e in response.data["events"])

    def test_defaults_to_own_items(self):
        mine = [self.task(self.me), self.work_item(self.me), self.appointment(self.me, stop_order=1)]
        self.task(self.other)
        self.work_item(self.other)
        self.appointment(self.other)

        response = self.get()

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.kinds(response), sorted([("task", mine[0].id), ("work_item", mine[1].id), ("appointment", mine[2].id)]))
        self.assertFalse(response.data["can_view_all"])
        self.assertEqual(response.data["employee"]["id"], self.me.id)

    def test_range_is_inclusive_and_bounded(self):
        inside = self.task(self.me, due=date(2026, 11, 10))
        self.task(self.me, due=date(2026, 11, 11))
        response = self.get(date_to="2026-11-10")
        self.assertEqual(self.kinds(response), [("task", inside.id)])

    def test_other_or_everyone_requires_view_all(self):
        self.assertEqual(self.get(employee="all").status_code, 403)
        self.assertEqual(self.get(employee=self.other.id).status_code, 403)
        self.assertEqual(self.get(employee=self.me.id).status_code, 200)

    def test_manager_can_view_everyone_and_others(self):
        a, b = self.task(self.me), self.task(self.other)
        everyone = self.get(as_employee=self.manager, employee="all")
        self.assertEqual(self.kinds(everyone), sorted([("task", a.id), ("task", b.id)]))
        self.assertIsNone(everyone.data["employee"])
        self.assertTrue(everyone.data["can_view_all"])
        self.assertEqual(self.kinds(self.get(employee=self.other.id)), [("task", b.id)])

    def test_cancelled_appointments_excluded_and_completed_marked_done(self):
        self.appointment(self.me, status=AppointmentStatus.CANCELLED)
        done = self.appointment(self.me, status=AppointmentStatus.COMPLETED, arrival_window_start=time(9))
        events = self.get().data["events"]
        self.assertEqual([(e["id"], e["done"], e["start_time"]) for e in events], [(done.id, True, "09:00")])

    def test_done_task_is_flagged(self):
        task = self.task(self.me)
        task.status = "Done"
        task.save()
        self.assertTrue(self.get().data["events"][0]["done"])

    def test_unscheduled_count(self):
        address = _address()
        Appointment.objects.create(tenant=self.tenant, address=address, first_name="A", type=AppointmentType.PICKUP)
        self.appointment(self.me)
        self.assertEqual(self.get().data["unscheduled_count"], 1)

    def test_validation(self):
        self.assertEqual(self.get(date_from="nope").status_code, 400)
        self.assertEqual(self.get(date_from="2026-11-05", date_to="2026-11-04").status_code, 400)
        self.assertEqual(self.get(date_from="2026-11-01", date_to="2027-01-02").status_code, 400)
        self.assertEqual(self.get(date_from="2026-11-01", date_to="2027-01-01").status_code, 200)

    def test_tenant_isolation(self):
        other_tenant, other_location, _ = build_tenant("b")
        foreign = make_employee(other_tenant, other_location, "foreign")
        Task.objects.create(tenant=other_tenant, assigned_employee=foreign, due_date=DAY)
        self.assertEqual(self.get(as_employee=self.manager, employee="all").data["events"], [])
        self.assertEqual(self.get(employee=foreign.id).status_code, 404)

    def test_carried_over_lists_unfinished_past_items(self):
        yesterday = date(2026, 11, 3)
        stale_stop = self.appointment(self.me, day=yesterday)
        self.appointment(self.me, day=yesterday, status=AppointmentStatus.FAILED)
        self.appointment(self.me, day=yesterday, status=AppointmentStatus.COMPLETED)
        late_task = self.task(self.me, due=yesterday)
        done = self.task(self.me, due=yesterday)
        done.status = "Done"
        done.save()
        late_item = self.work_item(self.me, due=yesterday)
        self.task(self.other, due=yesterday)
        self.task(self.me)

        carried = self.get(today=DAY.isoformat()).data["carried_over"]

        self.assertEqual(carried["total"], 3)
        self.assertEqual(
            sorted((e["kind"], e["id"]) for e in carried["items"]),
            sorted([("appointment", stale_stop.id), ("task", late_task.id), ("work_item", late_item.id)]),
        )

    def test_carried_over_only_when_asked(self):
        self.assertIsNone(self.get().data["carried_over"])

    def test_task_title_prefers_summary_then_type(self):
        repair = TaskType.objects.create(tenant=self.tenant, name="Repair")
        with_summary = self.task(self.me, task_type=repair)
        with_summary.summary = "Replace screen\nand battery"
        with_summary.save()
        Task.objects.create(tenant=self.tenant, assigned_employee=self.me, due_date=DAY, task_type=repair)

        titles = sorted((e["title"], e["subtitle"]) for e in self.get().data["events"])

        self.assertEqual(titles, [("Repair", None), ("Replace screen", "Repair")])
