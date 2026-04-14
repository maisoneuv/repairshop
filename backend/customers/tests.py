from django.test import TestCase
from rest_framework.test import APIClient
from tenants.models import Tenant
from customers.models import Customer, Lead
from core.models import User


class CustomerLookupAPITest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Test Tenant", subdomain="testco")
        self.customer = Customer.objects.create(
            tenant=self.tenant,
            first_name="Jan",
            last_name="Kowalski",
            phone_number="123456789",
        )
        self.client = APIClient()

    def _get(self, phone):
        return self.client.get(
            "/api/customers/api/customers/lookup/",
            {"phone": phone},
            HTTP_X_TENANT="testco",
        )

    def test_returns_customer_id(self):
        resp = self._get("123456789")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("id", resp.json()["customer"])
        self.assertEqual(resp.json()["customer"]["id"], self.customer.id)

    def test_returns_active_work_items_key(self):
        resp = self._get("123456789")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("active_work_items", data)
        self.assertIn("latest_closed_work_item", data)
        self.assertIsInstance(data["active_work_items"], list)

    def test_404_for_unknown_phone(self):
        resp = self._get("999999999")
        self.assertEqual(resp.status_code, 404)


class LeadCallbackStatusTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="CB Tenant", subdomain="cbtest")

    def test_lead_can_have_callback_status(self):
        lead = Lead.objects.create(
            tenant=self.tenant,
            first_name="Test",
            phone_number="600000001",
            status="callback",
        )
        lead.refresh_from_db()
        self.assertEqual(lead.status, "callback")

    def test_callback_in_status_choices(self):
        choices_values = [c[0] for c in Lead.STATUS_CHOICES]
        self.assertIn("callback", choices_values)


from tasks.models import WorkItem
from service.models import RepairShop, Location, Employee
from core.models import Role, UserRole, RolePermission, Address
from django.contrib.auth.models import Permission


class CustomerSearchViewTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Search Tenant", subdomain="searchtest")
        self.user = User.objects.create_user(
            email="search@test.com",
            password="pass",
            username="searchuser",
            tenant=self.tenant,
        )
        # Rola z uprawnieniem view_all_customers
        role = Role.objects.create(name="SearchAdmin", tenant=self.tenant)
        perm = Permission.objects.filter(codename='view_all_customers').first()
        if perm:
            RolePermission.objects.create(role=role, permission=perm)
        UserRole.objects.create(user=self.user, role=role)

        self.customer = Customer.objects.create(
            tenant=self.tenant,
            first_name="Jan",
            last_name="Kowalski",
            phone_number="500100200",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT="searchtest")

    def _search(self, q):
        return self.client.get(
            "/api/customers/search/",
            {"q": q},
            HTTP_X_TENANT="searchtest",
        )

    def _get_or_create_employee(self, location):
        """Reużywa istniejącego Employee dla self.user (unique constraint na user_id)."""
        employee = Employee.objects.filter(user=self.user).first()
        if employee:
            return employee
        return Employee.objects.create(
            tenant=self.tenant,
            user=self.user,
            role="technician",
            location=location,
        )

    def _create_workitem(self):
        """Helper: tworzy minimalny WorkItem dla self.customer."""
        address = Address.objects.create(street="Test St", building_number="1", city="TestCity", postal_code="00-001")
        shop = RepairShop.objects.create(
            tenant=self.tenant, name=f"Shop {address.pk}", type="internal", address=address
        )
        location = Location.objects.create(
            tenant=self.tenant, name="Loc X", type="shop", shop=shop
        )
        employee = self._get_or_create_employee(location)
        return WorkItem.objects.create(
            tenant=self.tenant,
            customer=self.customer,
            description="Test repair",
            owner=employee,
            dropoff_point=location,
        )

    def test_search_by_name_returns_work_items_field(self):
        resp = self._search("Kowalski")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 1)
        self.assertIn("work_items", data[0])

    def test_search_empty_returns_empty_list_not_404(self):
        resp = self._search("NieMaKogosTakiego")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    def test_search_by_rma_returns_customer(self):
        wi = self._create_workitem()
        resp = self._search(wi.reference_id)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertGreaterEqual(len(data), 1)
        names = [f"{d['first_name']} {d['last_name']}" for d in data]
        self.assertIn("Jan Kowalski", names)

    def test_search_by_rma_no_duplicate_customer(self):
        # Dwa WorkItems dla tego samego klienta — klient powinien pojawić się raz
        wi1 = self._create_workitem()
        wi2 = self._create_workitem()
        resp = self._search(wi1.reference_id[:4])  # szukaj fragmentem
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        ids = [d.get('id') for d in data if d.get('first_name') == 'Jan']
        self.assertEqual(len(set(ids)), 1)  # unique IDs only

    def test_response_includes_work_items_details(self):
        self._create_workitem()
        resp = self._search("Kowalski")
        self.assertEqual(resp.status_code, 200)
        work_items = resp.json()[0]["work_items"]
        self.assertGreater(len(work_items), 0)
        wi = work_items[0]
        self.assertIn("reference_id", wi)
        self.assertIn("status", wi)
        self.assertIn("device", wi)
