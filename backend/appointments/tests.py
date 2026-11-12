import io
from datetime import date
from decimal import Decimal
from unittest import mock

import requests
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.geocoding import GeocoderUnavailable, geocode, geocode_address
from core.models import Address, Note, Role, RolePermission, User, UserRole
from customers.models import Customer, Lead
from service.models import Employee, Location, RepairShop
from tasks.models import WorkItem
from tenants.models import Tenant

from .models import Appointment, AppointmentStatus, AvailabilityWindow, Route
from .routing import MAX_WAYPOINTS, google_maps_urls

BASE = "/api/appointments"

PERMISSIONS = [
    ("appointments", "add_appointment"),
    ("appointments", "change_appointment"),
    ("appointments", "add_route"),
    ("appointments", "change_route"),
    ("tasks", "add_workitem"),
    ("tasks", "change_workitem"),
]

THURSDAY = date(2026, 11, 5)


def build_tenant(letter, *, grant=True):
    tenant = Tenant.objects.create(name=f"Tenant {letter}", subdomain=f"apt-{letter}")
    user = User.objects.create_user(
        username=f"apt-{letter}@example.com", email=f"apt-{letter}@example.com",
        password="pw", tenant=tenant,
    )
    if grant:
        role = Role.objects.create(name=f"Planner {letter}", tenant=tenant)
        for app_label, codename in PERMISSIONS:
            perm = Permission.objects.get(content_type__app_label=app_label, codename=codename)
            RolePermission.objects.create(role=role, permission=perm)
        UserRole.objects.create(user=user, role=role)
    shop_address = Address.objects.create(
        street="Warsztatowa", building_number="1", city="Kraków", postal_code="30-001",
        latitude=Decimal("50.061400"), longitude=Decimal("19.936600"), geocode_status=Address.GEOCODE_OK,
    )
    shop = RepairShop.objects.create(tenant=tenant, name=f"Shop {letter}", address=shop_address)
    location = Location.objects.create(tenant=tenant, name=f"Shop {letter}", type="shop", shop=shop)
    employee = Employee.objects.create(tenant=tenant, user=user, role="Manager", location=location, is_driver=True)
    return tenant, user, employee, location


def make_appointment(tenant, lat=None, lng=None, **overrides):
    address = Address.objects.create(
        street="Długa", building_number="5", city="Kraków", postal_code="31-147",
        latitude=lat, longitude=lng,
        geocode_status=Address.GEOCODE_OK if lat is not None else Address.GEOCODE_PENDING,
    )
    data = {"first_name": "Anna", "last_name": "Nowak", "prefix": "+48", "phone_number": "601234567"}
    data.update(overrides)
    return Appointment.objects.create(tenant=tenant, address=address, **data)


class AppointmentApiTestCase(TestCase):
    def setUp(self):
        self.tenant, self.user, self.employee, self.shop_location = build_tenant("a")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def api(self, method, path, data=None, tenant=None):
        return getattr(self.client, method)(
            f"{BASE}{path}", data, format="json", HTTP_X_TENANT=(tenant or self.tenant).subdomain,
        )


class CreateAndListTests(AppointmentApiTestCase):
    payload = {
        "type": "pickup",
        "first_name": "Jan",
        "last_name": "Kowalski",
        "prefix": "+48",
        "phone_number": "600100200",
        "address": {
            "street": "Floriańska", "building_number": "10", "postal_code": "31-019",
            "city": "Kraków", "country": "Poland",
        },
        "device_description": "Laptop Lenovo",
        "availability_note": "weekdays after 17",
        "availability_windows": [{"weekday": 3, "start_time": "17:00"}],
    }

    def test_create_sets_reference_phone_and_windows(self):
        response = self.api("post", "/appointments/", self.payload)
        self.assertEqual(response.status_code, 201, response.data)
        appointment = Appointment.objects.get(pk=response.data["id"])
        self.assertEqual(appointment.reference_id, "APT-1")
        self.assertEqual(appointment.tenant, self.tenant)
        self.assertEqual(appointment.phone_e164, "+48600100200")
        self.assertEqual(appointment.address.geocode_status, Address.GEOCODE_PENDING)
        self.assertEqual(appointment.availability_windows.get().weekday, 3)

    def test_create_with_pin_from_form_skips_lookup(self):
        payload = {**self.payload, "address": {
            **self.payload["address"], "latitude": "50.061234", "longitude": "19.938765", "geocode_status": "manual",
        }}
        with mock.patch("core.tasks.queue_geocoding") as queue:
            response = self.api("post", "/appointments/", payload)
        self.assertEqual(response.status_code, 201, response.data)
        queue.assert_not_called()
        address = Appointment.objects.get(pk=response.data["id"]).address
        self.assertEqual((address.latitude, address.geocode_status), (Decimal("50.061234"), Address.GEOCODE_MANUAL))

    def test_create_without_pin_queues_lookup(self):
        with mock.patch("core.tasks.queue_geocoding") as queue:
            self.api("post", "/appointments/", self.payload)
        queue.assert_called_once()

    def test_half_a_pin_is_rejected(self):
        payload = {**self.payload, "address": {**self.payload["address"], "latitude": "50.1"}}
        self.assertEqual(self.api("post", "/appointments/", payload).status_code, 400)

    @mock.patch("appointments.views.geocode")
    def test_lookup_endpoint(self, geocode):
        geocode.return_value = {"latitude": Decimal("50.06"), "longitude": Decimal("19.94"), "label": "Floriańska 10, Kraków"}
        address = self.payload["address"]
        response = self.api("post", "/appointments/geocode/", address)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["found"])
        self.assertEqual(geocode.call_args.args[0], "Floriańska 10, 31-019 Kraków, Poland")

        geocode.return_value = None
        self.assertEqual(self.api("post", "/appointments/geocode/", address).data, {"found": False})

        geocode.side_effect = GeocoderUnavailable("blocked")
        self.assertEqual(self.api("post", "/appointments/geocode/", address).status_code, 503)

        self.assertEqual(self.api("post", "/appointments/geocode/", {"street": ""}).status_code, 400)

    def test_current_employee_exposes_city_for_form_default(self):
        response = self.client.get("/api/service/api/employee/me/", HTTP_X_TENANT=self.tenant.subdomain)
        self.assertEqual(response.data["employee"]["location_city"], "Kraków")

    def test_postal_code_is_optional(self):
        address = {k: v for k, v in self.payload["address"].items() if k != "postal_code"}
        response = self.api("post", "/appointments/", {**self.payload, "address": address})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["address"]["postal_code"], "")

    def test_create_requires_permission(self):
        _, other_user, _, _ = build_tenant("n", grant=False)
        self.client.force_authenticate(other_user)
        response = self.api("post", "/appointments/", self.payload, tenant=other_user.tenant)
        self.assertEqual(response.status_code, 403)

    def test_return_without_work_item_is_rejected(self):
        response = self.api("post", "/appointments/", {**self.payload, "type": "return_delivery"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("work_item", response.data)

    def test_contact_method_required(self):
        payload = {**self.payload, "phone_number": "", "prefix": ""}
        response = self.api("post", "/appointments/", payload)
        self.assertEqual(response.status_code, 400)

    def test_window_needs_exactly_one_of_date_or_weekday(self):
        payload = {**self.payload, "availability_windows": [{"weekday": 3, "date": "2026-11-05"}]}
        response = self.api("post", "/appointments/", payload)
        self.assertEqual(response.status_code, 400)

    def test_available_on_matches_weekday_date_and_unknown(self):
        by_weekday = make_appointment(self.tenant)
        AvailabilityWindow.objects.create(appointment=by_weekday, weekday=THURSDAY.weekday())
        by_date = make_appointment(self.tenant)
        AvailabilityWindow.objects.create(appointment=by_date, date=THURSDAY)
        other_day = make_appointment(self.tenant)
        AvailabilityWindow.objects.create(appointment=other_day, weekday=0)
        unknown = make_appointment(self.tenant)

        ids = {a["id"] for a in self.api("get", f"/appointments/?available_on={THURSDAY}").data}
        self.assertEqual(ids, {by_weekday.id, by_date.id, unknown.id})

        strict = {a["id"] for a in self.api("get", f"/appointments/?available_on={THURSDAY}&strict=1").data}
        self.assertEqual(strict, {by_weekday.id, by_date.id})


class TenantIsolationTests(AppointmentApiTestCase):
    def setUp(self):
        super().setUp()
        self.other_tenant, *_ = build_tenant("b")
        self.foreign = make_appointment(self.other_tenant)
        self.foreign_customer = Customer.objects.create(
            tenant=self.other_tenant, first_name="Foreign", phone_number="699999999",
        )

    def test_list_and_detail_exclude_other_tenant(self):
        mine = make_appointment(self.tenant)
        ids = {a["id"] for a in self.api("get", "/appointments/").data}
        self.assertEqual(ids, {mine.id})
        self.assertEqual(self.api("get", f"/appointments/{self.foreign.id}/").status_code, 404)
        self.assertEqual(self.api("post", f"/appointments/{self.foreign.id}/cancel/").status_code, 404)

    def test_cannot_link_foreign_customer(self):
        response = self.api("post", "/appointments/", {
            **CreateAndListTests.payload, "customer": self.foreign_customer.id,
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("customer", response.data)

    def test_nearby_ignores_other_tenant(self):
        mine = make_appointment(self.tenant, Decimal("50.0600"), Decimal("19.9400"))
        self.foreign.address.latitude, self.foreign.address.longitude = Decimal("50.0601"), Decimal("19.9401")
        self.foreign.address.save()
        response = self.api("get", f"/appointments/{mine.id}/nearby/")
        self.assertEqual(response.data, [])


class SchedulingTests(AppointmentApiTestCase):
    def test_schedule_by_date_auto_assigns_single_driver(self):
        appointment = make_appointment(self.tenant)
        response = self.api("post", f"/appointments/{appointment.id}/schedule/", {"date": str(THURSDAY)})
        self.assertEqual(response.status_code, 200, response.data)
        route = Route.objects.get()
        self.assertEqual(route.driver, self.employee)
        self.assertEqual(route.start_address, self.shop_location.shop.address)
        self.assertEqual(route.end_address, self.shop_location.shop.address)
        self.assertEqual(response.data["status"], "scheduled")
        self.assertEqual(response.data["stop_order"], 1)

    def test_schedule_at_position_and_reorder(self):
        first, second, third = (make_appointment(self.tenant) for _ in range(3))
        for appointment in (first, second):
            self.api("post", f"/appointments/{appointment.id}/schedule/", {"date": str(THURSDAY)})
        self.api("post", f"/appointments/{third.id}/schedule/", {"date": str(THURSDAY), "position": 0})
        route = Route.objects.get()
        self.assertEqual(self.api("get", f"/routes/{route.id}/").data["stop_ids"], [third.id, first.id, second.id])

        response = self.api("post", f"/routes/{route.id}/reorder/", {"appointment_ids": [second.id, first.id, third.id]})
        self.assertEqual(response.data["stop_ids"], [second.id, first.id, third.id])

        bad = self.api("post", f"/routes/{route.id}/reorder/", {"appointment_ids": [second.id]})
        self.assertEqual(bad.status_code, 400)

    def test_failed_then_rescheduled_and_unschedule_renumbers(self):
        first, second = make_appointment(self.tenant), make_appointment(self.tenant)
        for appointment in (first, second):
            self.api("post", f"/appointments/{appointment.id}/schedule/", {"date": str(THURSDAY)})

        failed = self.api("post", f"/appointments/{first.id}/mark-failed/", {"reason": "Not home"}).data
        self.assertEqual((failed["status"], failed["attempts"]), ("failed", 1))
        unscheduled = {a["id"] for a in self.api("get", "/appointments/?unscheduled=1").data}
        self.assertEqual(unscheduled, {first.id})

        self.api("post", f"/appointments/{first.id}/unschedule/")
        second.refresh_from_db()
        self.assertEqual(second.stop_order, 1)

        again = self.api("post", f"/appointments/{first.id}/schedule/", {"date": "2026-11-06"})
        self.assertEqual(again.data["status"], "scheduled")

    def test_closed_appointment_cannot_be_rescheduled_or_edited(self):
        appointment = make_appointment(self.tenant)
        self.api("post", f"/appointments/{appointment.id}/cancel/")
        response = self.api("post", f"/appointments/{appointment.id}/schedule/", {"date": str(THURSDAY)})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.api("patch", f"/appointments/{appointment.id}/", {"notes": "x"}).status_code, 400)

    def test_nearby_returns_sorted_within_radius(self):
        origin = make_appointment(self.tenant, Decimal("50.0600"), Decimal("19.9400"))
        close = make_appointment(self.tenant, Decimal("50.0650"), Decimal("19.9450"))
        closer = make_appointment(self.tenant, Decimal("50.0610"), Decimal("19.9410"))
        make_appointment(self.tenant, Decimal("52.2297"), Decimal("21.0122"))  # Warsaw
        make_appointment(self.tenant)  # not geocoded
        response = self.api("get", f"/appointments/{origin.id}/nearby/?radius_km=5")
        self.assertEqual([a["id"] for a in response.data], [closer.id, close.id])

    def test_set_location_marks_pin_manual(self):
        appointment = make_appointment(self.tenant)
        response = self.api("post", f"/appointments/{appointment.id}/set-location/", {"latitude": 50.05, "longitude": 19.93})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["address"]["geocode_status"], Address.GEOCODE_MANUAL)
        bad = self.api("post", f"/appointments/{appointment.id}/set-location/", {"latitude": 95, "longitude": 19.93})
        self.assertEqual(bad.status_code, 400)


class CompletionTests(AppointmentApiTestCase):
    def test_complete_pickup_creates_customer_and_work_item(self):
        lead = Lead.objects.create(tenant=self.tenant, first_name="Anna", phone_number="601234567")
        appointment = make_appointment(
            self.tenant, lead=lead, device_description="iPhone 12", issue_description="Cracked screen",
        )
        self.api("post", f"/appointments/{appointment.id}/schedule/", {"date": str(THURSDAY)})

        response = self.api("post", f"/appointments/{appointment.id}/complete/")
        self.assertEqual(response.status_code, 200, response.data)

        work_item = WorkItem.objects.get(pk=response.data["work_item_id"])
        appointment.refresh_from_db()
        lead.refresh_from_db()
        self.assertEqual(work_item.tenant, self.tenant)
        self.assertEqual(work_item.intake_method, "driver")
        self.assertEqual(work_item.dropoff_point, self.shop_location)
        self.assertEqual(work_item.pickup_point.address, appointment.address)
        self.assertEqual(work_item.customer, appointment.customer)
        self.assertIn("Cracked screen", work_item.description)
        self.assertEqual(appointment.customer.address, appointment.address)
        self.assertEqual(appointment.status, AppointmentStatus.COMPLETED)
        self.assertEqual(lead.status, "converted")
        self.assertTrue(Note.objects.filter(
            content_type=ContentType.objects.get_for_model(WorkItem), object_id=work_item.pk,
            content__contains=appointment.reference_id,
        ).exists())

    def test_complete_pickup_matches_existing_customer_by_phone(self):
        existing = Customer.objects.create(tenant=self.tenant, first_name="Anna", prefix="+48", phone_number="601234567")
        appointment = make_appointment(self.tenant, phone_number="601 234 567")
        response = self.api("post", f"/appointments/{appointment.id}/complete/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(WorkItem.objects.get(pk=response.data["work_item_id"]).customer, existing)
        self.assertEqual(Customer.objects.filter(tenant=self.tenant).count(), 1)

    def test_complete_twice_is_rejected(self):
        appointment = make_appointment(self.tenant)
        self.api("post", f"/appointments/{appointment.id}/complete/")
        response = self.api("post", f"/appointments/{appointment.id}/complete/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(WorkItem.objects.count(), 1)

    def test_complete_return_updates_work_item(self):
        customer = Customer.objects.create(tenant=self.tenant, first_name="Anna", phone_number="601234567")
        work_item = WorkItem.objects.create(
            tenant=self.tenant, customer=customer, description="Repair",
            owner=self.employee, dropoff_point=self.shop_location,
        )
        appointment = make_appointment(self.tenant, type="return_delivery", work_item=work_item, customer=customer)
        response = self.api("post", f"/appointments/{appointment.id}/complete/")
        self.assertEqual(response.status_code, 200, response.data)
        work_item.refresh_from_db()
        self.assertEqual(work_item.dropoff_method, "driver")
        self.assertEqual(response.data["work_item_id"], work_item.id)
        self.assertTrue(Note.objects.filter(object_id=work_item.pk, content__contains="Delivered").exists())

    def test_device_label_falls_back_to_work_item_device(self):
        from customers.models import Asset
        from inventory.models import Device
        customer = Customer.objects.create(tenant=self.tenant, first_name="Anna", phone_number="601234567")
        device = Device.objects.create(manufacturer="Samsung", model="WW90")
        work_item = WorkItem.objects.create(
            tenant=self.tenant, customer=customer, description="Repair", owner=self.employee,
            dropoff_point=self.shop_location, customer_asset=Asset.objects.create(customer=customer, device=device),
        )
        ret = make_appointment(self.tenant, type="return_delivery", work_item=work_item, customer=customer)
        pickup = make_appointment(self.tenant, device_description="Pralka LG")
        labels = {a["id"]: a["device_label"] for a in self.api("get", "/appointments/").data}
        self.assertEqual(labels[ret.id], "Samsung WW90")
        self.assertEqual(labels[pickup.id], "Pralka LG")

    def test_return_device_label_comes_from_the_pickup(self):
        pickup = make_appointment(self.tenant, device_description="telewizor LG")
        work_item_id = self.api("post", f"/appointments/{pickup.id}/complete/").data["work_item_id"]
        ret = make_appointment(
            self.tenant, type="return_delivery", work_item_id=work_item_id, customer=Appointment.objects.get(pk=pickup.pk).customer,
        )
        self.assertEqual(self.api("get", f"/appointments/{ret.id}/").data["device_label"], "telewizor LG")

    def test_customer_matches(self):
        Customer.objects.create(tenant=self.tenant, first_name="Anna", prefix="+48", phone_number="601234567")
        response = self.api("get", "/appointments/customer-matches/?prefix=%2B48&phone_number=601234567")
        self.assertEqual([m["name"] for m in response.data], ["Anna"])


class RouteEndpointTests(AppointmentApiTestCase):
    def setUp(self):
        super().setUp()
        self.shop_address = self.shop_location.shop.address
        perm = Permission.objects.get(codename="manage_users")
        RolePermission.objects.create(role=Role.objects.get(tenant=self.tenant), permission=perm)

    def set_home(self):
        response = self.api("patch", f"/drivers/{self.employee.id}/", {"home_address": {
            "street": "Wiśniowa", "building_number": "6", "city": "Warszawa",
            "latitude": "52.201602", "longitude": "21.018901",
        }})
        self.assertEqual(response.status_code, 200, response.data)
        self.employee.refresh_from_db()

    def schedule_one(self):
        appointment = make_appointment(self.tenant)
        self.api("post", f"/appointments/{appointment.id}/schedule/", {"date": str(THURSDAY)})
        return Route.objects.get()

    def test_home_is_default_start_and_shop_default_end(self):
        self.set_home()
        route = self.schedule_one()
        self.assertEqual(route.start_address, self.employee.home_address)
        self.assertEqual(route.end_address, self.shop_address)
        data = self.api("get", f"/routes/{route.id}/").data
        self.assertEqual((data["start"]["kind"], data["start"]["label"]), ("home", "Home"))
        self.assertEqual((data["end"]["kind"], data["end"]["label"]), ("shop", self.shop_location.name))
        self.assertIn("origin=Wi%C5%9Bniowa+6", data["google_maps_urls"][0])
        self.assertIn("destination=Warsztatowa+1", data["google_maps_urls"][0])

    def test_change_start_and_end_for_one_day(self):
        self.set_home()
        route = self.schedule_one()
        response = self.api("patch", f"/routes/{route.id}/", {
            "start": {"kind": "shop"},
            "end": {"kind": "other", "address": {"street": "Marszałkowska", "building_number": "10", "city": "Warszawa"}},
        })
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["start"]["kind"], "shop")
        self.assertEqual((response.data["end"]["kind"], response.data["end"]["address"]), ("other", "Marszałkowska 10, Warszawa"))
        response = self.api("patch", f"/routes/{route.id}/", {"start": {"kind": "home"}})
        self.assertEqual(response.data["start"]["kind"], "home")

    def test_home_start_without_home_address_is_rejected(self):
        route = self.schedule_one()
        response = self.api("patch", f"/routes/{route.id}/", {"start": {"kind": "home"}})
        self.assertEqual(response.status_code, 400)
        self.assertIn("start", response.data)

    def test_new_home_address_keeps_old_routes_unchanged(self):
        self.set_home()
        route = self.schedule_one()
        old_home = route.start_address
        self.set_home()
        route.refresh_from_db()
        self.assertEqual(route.start_address, old_home)
        self.assertNotEqual(self.employee.home_address, old_home)

    def test_route_can_be_created_for_an_empty_day(self):
        response = self.api("post", "/routes/", {
            "date": str(THURSDAY), "driver": self.employee.id, "end": {"kind": "shop"},
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["start"]["kind"], "shop")


class DriverTests(AppointmentApiTestCase):
    def test_only_user_admins_can_toggle_driver(self):
        response = self.api("patch", f"/drivers/{self.employee.id}/", {"is_driver": False})
        self.assertEqual(response.status_code, 403)

        perm = Permission.objects.get(codename="manage_users")
        RolePermission.objects.create(role=Role.objects.get(tenant=self.tenant), permission=perm)
        response = self.api("patch", f"/drivers/{self.employee.id}/", {"is_driver": False})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.api("get", "/drivers/?is_driver=1").data, [])

    def test_route_planners_can_set_home_without_user_admin_rights(self):
        response = self.api("patch", f"/drivers/{self.employee.id}/", {"home_address": {
            "street": "Wiśniowa", "building_number": "6", "city": "Warszawa",
        }})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["home_address"]["street"], "Wiśniowa")

    def test_first_driver_adopts_routes_planned_without_one(self):
        self.employee.is_driver = False
        self.employee.save()
        appointment = make_appointment(self.tenant)
        self.api("post", f"/appointments/{appointment.id}/schedule/", {"date": "2099-01-01"})
        self.assertIsNone(Route.objects.get().driver)

        perm = Permission.objects.get(codename="manage_users")
        RolePermission.objects.create(role=Role.objects.get(tenant=self.tenant), permission=perm)
        self.api("patch", f"/drivers/{self.employee.id}/", {"is_driver": True})
        route = Route.objects.get()
        self.assertEqual(route.driver, self.employee)
        self.assertEqual(route.start_address, self.shop_location.shop.address)
        self.assertEqual(route.end_address, self.shop_location.shop.address)


@override_settings(GEOCODER_PROVIDER="nominatim", GEOCODER_USER_AGENT="tests")
class GeocodingTests(TestCase):
    def make_address(self, **extra):
        return Address.objects.create(**{"street": "Długa", "building_number": "5", "city": "Kraków", "postal_code": "31-147", **extra})

    @mock.patch("core.geocoding._throttle")
    @mock.patch("core.geocoding._session.get")
    def test_found_address_gets_coordinates(self, get, _throttle):
        get.return_value.json.return_value = [
            {"lat": "50.0681234567", "lon": "19.9412345678", "address": {"postcode": "31-147"}},
        ]
        self.assertEqual(geocode("Długa 5, Kraków")["postal_code"], "31-147")
        address = geocode_address(self.make_address())
        self.assertEqual(address.geocode_status, Address.GEOCODE_OK)
        self.assertEqual(address.latitude, Decimal("50.068123"))
        self.assertEqual(get.call_args.kwargs["headers"]["User-Agent"], "tests")

    @mock.patch("core.tasks.queue_geocoding")
    @mock.patch("core.geocoding._throttle")
    @mock.patch("core.geocoding._session.get")
    def test_lookup_fills_missing_postal_code_without_requeueing(self, get, _throttle, queue):
        get.return_value.json.return_value = [
            {"lat": "50.06", "lon": "19.94", "address": {"postcode": "31-147"}},
        ]
        address = self.make_address(postal_code="")
        queue.reset_mock()
        geocode_address(Address.objects.get(pk=address.pk))
        address.refresh_from_db()
        self.assertEqual((address.postal_code, address.geocode_status), ("31-147", Address.GEOCODE_OK))
        queue.assert_not_called()

    @mock.patch("core.geocoding._throttle")
    @mock.patch("core.geocoding._session.get")
    def test_lookup_keeps_postal_code_someone_typed(self, get, _throttle):
        get.return_value.json.return_value = [
            {"lat": "50.06", "lon": "19.94", "address": {"postcode": "30-001"}},
        ]
        address = geocode_address(self.make_address())
        address.refresh_from_db()
        self.assertEqual(address.postal_code, "31-147")

    def test_address_without_postal_code_or_country_defaults_country(self):
        address = Address.objects.create(street="Długa", building_number="5", city="Kraków", country="")
        self.assertEqual((address.postal_code, address.country), ("", "Poland"))

    @mock.patch("core.geocoding._throttle")
    @mock.patch("core.geocoding._session.get")
    def test_missing_address_marked_failed(self, get, _throttle):
        get.return_value.json.return_value = []
        self.assertEqual(geocode_address(self.make_address()).geocode_status, Address.GEOCODE_FAILED)

    @mock.patch("core.geocoding._throttle")
    @mock.patch("core.geocoding._session.get")
    def test_blocked_user_agent_stops_command_with_explanation(self, get, _throttle):
        get.return_value.status_code = 403
        address = self.make_address()
        with self.assertRaises(GeocoderUnavailable):
            geocode_address(address)
        with self.assertRaisesMessage(CommandError, "GEOCODER_USER_AGENT"):
            call_command("geocode_addresses", stdout=io.StringIO())
        address.refresh_from_db()
        self.assertEqual(address.geocode_status, Address.GEOCODE_PENDING)

    @mock.patch("core.geocoding._throttle")
    @mock.patch("core.geocoding._session.get")
    def test_command_skips_addresses_that_error(self, get, _throttle):
        ok = mock.Mock(status_code=200)
        ok.json.return_value = [{"lat": "50.1", "lon": "19.9"}]
        get.side_effect = [requests.ConnectionError("timeout"), ok]
        first, second = self.make_address(), self.make_address()
        out = io.StringIO()
        call_command("geocode_addresses", stdout=out, stderr=io.StringIO())
        first.refresh_from_db(); second.refresh_from_db()
        self.assertEqual(first.geocode_status, Address.GEOCODE_PENDING)
        self.assertEqual(second.geocode_status, Address.GEOCODE_OK)
        self.assertIn("1 failed with errors", out.getvalue())

    @override_settings(GEOCODER_USER_AGENT="")
    def test_missing_user_agent_is_refused_before_any_request(self):
        with self.assertRaises(GeocoderUnavailable):
            geocode_address(self.make_address())

    @mock.patch("core.tasks.queue_geocoding")
    def test_editing_address_anywhere_resets_pin_and_queues_lookup(self, queue):
        address = self.make_address(latitude=Decimal("50.1"), longitude=Decimal("19.9"), geocode_status=Address.GEOCODE_OK)
        queue.reset_mock()
        address = Address.objects.get(pk=address.pk)
        address.street = "Magnacka"
        address.save()
        address.refresh_from_db()
        self.assertEqual((address.latitude, address.geocode_status), (None, Address.GEOCODE_PENDING))
        queue.assert_called_once()

    @mock.patch("core.tasks.queue_geocoding")
    def test_saving_without_address_change_keeps_pin(self, queue):
        address = self.make_address(latitude=Decimal("50.1"), longitude=Decimal("19.9"), geocode_status=Address.GEOCODE_OK)
        queue.reset_mock()
        address = Address.objects.get(pk=address.pk)
        address.apartment_number = "4"
        address.save()
        address.refresh_from_db()
        self.assertEqual(address.latitude, Decimal("50.1"))
        queue.assert_not_called()

    @mock.patch("core.geocoding._throttle")
    @mock.patch("core.geocoding._session.get")
    def test_command_repairs_found_without_coordinates(self, get, _throttle):
        get.return_value.status_code = 200
        get.return_value.json.return_value = [{"lat": "52.2", "lon": "21.0"}]
        address = self.make_address(latitude=Decimal("1"), longitude=Decimal("1"), geocode_status=Address.GEOCODE_OK)
        Address.objects.filter(pk=address.pk).update(latitude=None, longitude=None)
        call_command("geocode_addresses", stdout=io.StringIO())
        address.refresh_from_db()
        self.assertEqual(address.latitude, Decimal("52.200000"))

    @mock.patch("core.geocoding._session.get")
    def test_manual_pin_is_not_overwritten(self, get):
        address = self.make_address(latitude=Decimal("1"), longitude=Decimal("2"), geocode_status=Address.GEOCODE_MANUAL)
        geocode_address(address)
        get.assert_not_called()


class GoogleMapsUrlTests(TestCase):
    def test_long_route_is_split_into_legs(self):
        start = Address(street="A", building_number="1", city="X", postal_code="1", latitude=Decimal("1"), longitude=Decimal("1"))
        stops = [
            Address(street="S", building_number=str(i), city="X", postal_code="1", latitude=Decimal(i), longitude=Decimal(i))
            for i in range(2, 2 + MAX_WAYPOINTS + 3)
        ]
        urls = google_maps_urls(start, stops, start)
        self.assertEqual(len(urls), 2)
        self.assertIn("origin=A+1%2C+X", urls[0])
        self.assertIn("destination=A+1%2C+X", urls[-1])
        self.assertEqual(google_maps_urls(start, []), [])

    def test_written_address_preferred_over_coordinates(self):
        stop = Address(street="Długa", building_number="5", city="Kraków", postal_code="",
                       latitude=Decimal("50.07"), longitude=Decimal("19.94"))
        no_street = Address(street="", building_number="", city="", postal_code="",
                            latitude=Decimal("50.08"), longitude=Decimal("19.95"))
        url = google_maps_urls(None, [stop, no_street])[0]
        self.assertIn("origin=D%C5%82uga+5%2C+Krak%C3%B3w%2C+Poland", url)
        self.assertIn("destination=50.08%2C19.95", url)
