from django.test import TestCase
from django.utils import timezone

from core.models import Address, User
from customers.models import Customer
from service.models import Employee, Location, RepairShop
from tenants.models import Tenant

from .models import WorkItem
from .serializers import WorkItemSerializer


class WorkItemTimestampTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Stamps", subdomain="stamps")
        address = Address.objects.create(
            street="Main", building_number="1", city="City", postal_code="00-001")
        shop = RepairShop.objects.create(
            tenant=cls.tenant, name="Shop", type="internal", address=address)
        cls.location = Location.objects.create(
            tenant=cls.tenant, name="Bench", type="shop", shop=shop)
        owner_user = User.objects.create_user(
            username="owner@example.com", email="owner@example.com",
            password="pw", tenant=cls.tenant)
        cls.owner = Employee.objects.create(
            tenant=cls.tenant, user=owner_user, role="owner", location=cls.location)
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, first_name="Cust", last_name="One",
            phone_number="600000001")

    def _work_item(self):
        return WorkItem.objects.create(
            tenant=self.tenant, description="Cracked screen",
            customer=self.customer, owner=self.owner,
            dropoff_point=self.location,
        )

    def test_a_new_work_item_is_stamped_as_created_not_edited(self):
        item = self._work_item()

        self.assertIsNotNone(item.updated_date)
        self.assertLess(
            abs((item.updated_date - item.created_date).total_seconds()), 1)

    def test_saving_moves_updated_date_but_not_created_date(self):
        item = self._work_item()
        created, first_update = item.created_date, item.updated_date

        item.status = "In Progress"
        item.save()
        item.refresh_from_db()

        self.assertGreater(item.updated_date, first_update)
        self.assertEqual(item.created_date, created)

    def test_both_stamps_are_serialized_and_neither_is_writable(self):
        item = self._work_item()
        data = WorkItemSerializer(item).data

        self.assertIn("created_date", data)
        self.assertIn("updated_date", data)

        forged = timezone.now() - timezone.timedelta(days=365)
        serializer = WorkItemSerializer(
            item, data={"updated_date": forged.isoformat()}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertNotIn("updated_date", serializer.validated_data)
