"""
Cross-tenant isolation regression tests (security audit 2026-07, C-1 / C-2).

C-1: endpoints must not be reachable anonymously, and notes must be scoped
     to the request tenant.
C-2: serializer foreign keys must reject PKs belonging to another tenant.
"""
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Address, Note
from customers.models import Customer
from customers.serializers import AssetSerializer
from service.models import CashRegister, Employee, Location, RepairShop
from service.serializers import CashTransferSerializer
from tasks.models import TaskType, WorkItem
from tasks.serializers import TaskSerializer, WorkItemSerializer
from tenants.models import Tenant
from core.models import User


def _tenant_fixture(subdomain):
    """Create a tenant with one of each related object needed by the tests."""
    tenant = Tenant.objects.create(name=subdomain, subdomain=subdomain)
    user = User.objects.create_user(
        username=f"user@{subdomain}.test",
        email=f"user@{subdomain}.test",
        password="test-password",
        tenant=tenant,
    )
    address = Address.objects.create(
        street="Main", city="Warsaw", building_number="1", postal_code="00-001"
    )
    shop = RepairShop.objects.create(tenant=tenant, name="Shop", address=address)
    location = Location.objects.create(tenant=tenant, name="Front desk", shop=shop)
    employee = Employee.objects.create(
        tenant=tenant, user=user, role="tech", location=location
    )
    customer = Customer.objects.create(
        tenant=tenant, first_name="Jan", last_name="Kowalski", phone_number="123456789"
    )
    register = CashRegister.objects.create(tenant=tenant, shop=shop, name="Main till")
    task_type = TaskType.objects.create(tenant=tenant, name="Diagnosis")
    work_item = WorkItem.objects.create(
        tenant=tenant,
        description="broken screen",
        customer=customer,
        owner=employee,
        dropoff_point=location,
    )
    return {
        "tenant": tenant,
        "user": user,
        "shop": shop,
        "location": location,
        "employee": employee,
        "customer": customer,
        "register": register,
        "task_type": task_type,
        "work_item": work_item,
    }


class TenantIsolationTestBase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = _tenant_fixture("tenant-a")
        cls.b = _tenant_fixture("tenant-b")

    def setUp(self):
        self.client = APIClient()


class AnonymousAccessTests(TenantIsolationTestBase):
    """C-1: no endpoint below may be readable without authentication."""

    def test_notes_endpoint_requires_authentication(self):
        Note.objects.create(
            content="secret repair detail",
            content_type=ContentType.objects.get_for_model(WorkItem),
            object_id=self.b["work_item"].id,
        )
        resp = self.client.get(
            f"/api/core/notes/workitem/{self.b['work_item'].id}/",
            HTTP_X_TENANT="tenant-b",
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_workitem_search_requires_authentication(self):
        resp = self.client.get(
            "/api/tasks/work-items/",
            {"search": "RMA"},
            HTTP_X_TENANT="tenant-b",
        )
        self.assertIn(resp.status_code, (401, 403))


class CrossTenantNoteTests(TenantIsolationTestBase):
    """C-1: notes are scoped to the request tenant."""

    def _login_as_a(self):
        # Session login (not force_authenticate) so TenantMiddleware sees the
        # user and resolves request.tenant from the user's own tenant.
        self.assertTrue(
            self.client.login(email="user@tenant-a.test", password="test-password")
        )

    def test_cannot_read_other_tenants_notes(self):
        self._login_as_a()
        resp = self.client.get(f"/api/core/notes/workitem/{self.b['work_item'].id}/")
        self.assertEqual(resp.status_code, 404)

    def test_can_read_own_tenant_notes(self):
        self._login_as_a()
        resp = self.client.get(f"/api/core/notes/workitem/{self.a['work_item'].id}/")
        self.assertEqual(resp.status_code, 200)

    def test_cannot_create_note_on_other_tenants_object(self):
        self._login_as_a()
        resp = self.client.post(
            f"/api/core/notes/workitem/{self.b['work_item'].id}/",
            {"content": "injected"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(
            Note.objects.filter(object_id=self.b["work_item"].id, content="injected").exists()
        )


class CrossTenantSerializerFKTests(TenantIsolationTestBase):
    """C-2: serializer FKs validate against the caller's tenant only."""

    def _workitem_errors(self, data):
        serializer = WorkItemSerializer(data=data, context={"tenant": self.a["tenant"]})
        serializer.is_valid()
        return serializer.errors

    def test_workitem_rejects_other_tenants_fks(self):
        errors = self._workitem_errors({
            "owner_id": self.b["employee"].pk,
            "technician_id": self.b["employee"].pk,
            "payment_register_id": self.b["register"].pk,
            "fulfillment_shop_id": self.b["shop"].pk,
        })
        for field in ("owner_id", "technician_id", "payment_register_id", "fulfillment_shop_id"):
            self.assertIn(field, errors, f"{field} accepted a cross-tenant PK")

    def test_workitem_accepts_own_tenant_fks(self):
        errors = self._workitem_errors({
            "owner_id": self.a["employee"].pk,
            "technician_id": self.a["employee"].pk,
            "payment_register_id": self.a["register"].pk,
            "fulfillment_shop_id": self.a["shop"].pk,
        })
        for field in ("owner_id", "technician_id", "payment_register_id", "fulfillment_shop_id"):
            self.assertNotIn(field, errors, f"{field} rejected a same-tenant PK")

    def test_task_rejects_other_tenants_fks(self):
        serializer = TaskSerializer(
            data={
                "assigned_employee_id": self.b["employee"].pk,
                "task_type_id": self.b["task_type"].pk,
            },
            context={"tenant": self.a["tenant"]},
        )
        serializer.is_valid()
        self.assertIn("assigned_employee_id", serializer.errors)
        self.assertIn("task_type_id", serializer.errors)

    def test_asset_rejects_other_tenants_customer(self):
        serializer = AssetSerializer(
            data={"customer_id": self.b["customer"].pk, "serial_number": "SN1"},
            context={"tenant": self.a["tenant"]},
        )
        serializer.is_valid()
        self.assertIn("customer_id", serializer.errors)

    def test_cash_transfer_rejects_other_tenants_register(self):
        serializer = CashTransferSerializer(
            data={
                "source_register": self.a["register"].pk,
                "destination_register": self.b["register"].pk,
                "amount": "10.00",
            },
            context={"tenant": self.a["tenant"]},
        )
        serializer.is_valid()
        self.assertIn("destination_register", serializer.errors)
        self.assertNotIn("source_register", serializer.errors)
