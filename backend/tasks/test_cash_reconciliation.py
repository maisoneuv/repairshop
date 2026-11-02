from decimal import Decimal

from django.contrib.auth.models import Permission
from django.db.models import Sum
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Address, Role, RolePermission, User, UserRole
from customers.models import Customer
from service.models import (
    CashRegister, CashTransaction, CashTransactionType, Employee, Location, RepairShop,
)
from tenants.models import Tenant

from .models import WorkItem


class CashReconciliationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Till", subdomain="till")
        address = Address.objects.create(
            street="Main", building_number="1", city="City", postal_code="00-001")
        cls.shop = RepairShop.objects.create(
            tenant=cls.tenant, name="Shop", type="internal", address=address)
        cls.location = Location.objects.create(
            tenant=cls.tenant, name="Bench", type="shop", shop=cls.shop)
        cls.register = CashRegister.objects.create(
            tenant=cls.tenant, shop=cls.shop, name="Front desk")
        cls.other_register = CashRegister.objects.create(
            tenant=cls.tenant, shop=cls.shop, name="Back office")

        cls.user = User.objects.create_user(
            username="cs@example.com", email="cs@example.com",
            password="pw", tenant=cls.tenant)
        role = Role.objects.create(name="CS", tenant=cls.tenant)
        for codename in ("change_workitem", "add_workitem", "view_all_workitems"):
            perm = Permission.objects.filter(codename=codename).first()
            if perm:
                RolePermission.objects.create(role=role, permission=perm)
        UserRole.objects.create(user=cls.user, role=role)

        cls.owner = Employee.objects.create(
            tenant=cls.tenant, user=cls.user, role="owner", location=cls.location)
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, first_name="Cust", last_name="One",
            phone_number="600000001")

    def setUp(self):
        self.work_item = WorkItem.objects.create(
            tenant=self.tenant, customer=self.customer, description="Cracked screen",
            owner=self.owner, dropoff_point=self.location, status="New")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_TENANT=self.tenant.subdomain)

    def patch(self, **payload):
        response = self.client.patch(
            f"/api/tasks/work-items/{self.work_item.id}/", payload, format="json")
        self.assertIn(response.status_code, (200, 202), response.data)
        self.work_item.refresh_from_db()
        return response

    def booked(self, register=None):
        """Withdrawals are stored negative, so summing nets them off."""
        return CashTransaction.objects.filter(
            work_item=self.work_item, register=register or self.register
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    def test_prepaid_then_final_price_is_not_double_counted(self):
        self.patch(payment_register_id=self.register.id, prepaid_amount="100.00")
        self.assertEqual(self.booked(), Decimal("100.00"))

        self.patch(final_price="1000.00")

        self.assertEqual(self.booked(), Decimal("1000.00"))

    def test_correcting_the_final_price_books_only_the_difference(self):
        self.patch(payment_register_id=self.register.id, final_price="1000.00")

        self.patch(final_price="1200.00")
        self.assertEqual(self.booked(), Decimal("1200.00"))

        self.patch(final_price="800.00")
        self.assertEqual(self.booked(), Decimal("800.00"))
        self.assertTrue(CashTransaction.objects.filter(
            work_item=self.work_item,
            transaction_type=CashTransactionType.WITHDRAWAL).exists())

    def test_an_unrelated_edit_books_nothing_new(self):
        self.patch(payment_register_id=self.register.id, final_price="500.00")
        before = CashTransaction.objects.filter(work_item=self.work_item).count()

        self.patch(description="Cracked screen and a bent frame")

        self.assertEqual(
            CashTransaction.objects.filter(work_item=self.work_item).count(), before)
        self.assertEqual(self.booked(), Decimal("500.00"))

    def test_reassigning_the_register_moves_the_money_across(self):
        self.patch(payment_register_id=self.register.id, final_price="400.00")

        self.patch(payment_register_id=self.other_register.id)

        self.assertEqual(self.booked(self.register), Decimal("0.00"))
        self.assertEqual(self.booked(self.other_register), Decimal("400.00"))

    def test_reassignment_after_a_price_reduction_moves_the_net(self):
        self.patch(payment_register_id=self.register.id, final_price="1000.00")
        self.patch(final_price="600.00")

        self.patch(payment_register_id=self.other_register.id)

        self.assertEqual(self.booked(self.register), Decimal("0.00"))
        self.assertEqual(self.booked(self.other_register), Decimal("600.00"))
