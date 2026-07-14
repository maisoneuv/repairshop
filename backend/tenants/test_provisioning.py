"""
Tests for tenant bootstrap provisioning (architecture review blocker 3.2 —
"a new tenant gets a broken app").
"""
from django.test import TestCase

from core.models import User
from customers.models import Customer
from service.models import CashRegister, Employee, Location, RepairShop
from tasks.models import WorkItem
from tenants.models import Tenant
from tenants.provisioning import TenantAlreadyProvisionedError, provision_tenant


class ProvisionTenantTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Acme Repairs", subdomain="acme")

    def test_creates_full_object_graph(self):
        result = provision_tenant(
            self.tenant,
            admin_email="owner@acme.com",
            admin_password="s3cr3t-password",
        )

        self.assertTrue(RepairShop.objects.filter(tenant=self.tenant).exists())
        self.assertTrue(Location.objects.filter(tenant=self.tenant).exists())
        self.assertTrue(CashRegister.objects.filter(tenant=self.tenant).exists())
        self.assertTrue(Employee.objects.filter(tenant=self.tenant).exists())

        admin_user = User.objects.get(email="owner@acme.com")
        self.assertEqual(admin_user.tenant, self.tenant)
        self.assertTrue(admin_user.check_password("s3cr3t-password"))
        self.assertFalse(admin_user.is_staff)
        self.assertFalse(admin_user.is_superuser)

        self.assertEqual(result["employee"].user, admin_user)
        self.assertEqual(result["employee"].location, result["location"])

    def test_admin_user_gets_tenant_admin_permissions(self):
        provision_tenant(
            self.tenant,
            admin_email="owner@acme.com",
            admin_password="s3cr3t-password",
        )

        admin_user = User.objects.get(email="owner@acme.com")
        self.assertTrue(admin_user.has_permission("tasks.add_workitem", self.tenant))
        self.assertTrue(admin_user.has_permission("core.manage_users", self.tenant))

    def test_admin_can_immediately_create_a_work_item(self):
        result = provision_tenant(
            self.tenant,
            admin_email="owner@acme.com",
            admin_password="s3cr3t-password",
        )

        customer = Customer.objects.create(
            tenant=self.tenant, first_name="Jan", last_name="Kowalski", phone_number="123456789",
        )
        work_item = WorkItem.objects.create(
            tenant=self.tenant,
            description="Broken screen",
            customer=customer,
            owner=result["employee"],
            dropoff_point=result["location"],
        )

        self.assertEqual(work_item.status, "New")

    def test_refuses_to_reprovision_a_tenant(self):
        provision_tenant(
            self.tenant,
            admin_email="owner@acme.com",
            admin_password="s3cr3t-password",
        )

        with self.assertRaises(TenantAlreadyProvisionedError):
            provision_tenant(
                self.tenant,
                admin_email="owner2@acme.com",
                admin_password="another-password",
            )

        # Nothing extra was created by the failed second attempt.
        self.assertEqual(RepairShop.objects.filter(tenant=self.tenant).count(), 1)
        self.assertFalse(User.objects.filter(email="owner2@acme.com").exists())
