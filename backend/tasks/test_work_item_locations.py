from django.test import TestCase
from rest_framework.test import APIRequestFactory

from core.models import Address, User
from customers.models import Customer
from service.models import Employee, Location, RepairShop
from tasks.models import WorkItem
from tasks.serializers import WorkItemSerializer
from tenants.models import Tenant


class WorkItemLocationWriteTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Locs", subdomain="locs")
        shop = RepairShop.objects.create(
            tenant=cls.tenant, name="Shop", type="internal",
            address=Address.objects.create(street="Main", building_number="1", city="City"))
        cls.shop_location = Location.objects.create(
            tenant=cls.tenant, name="Shop", type="shop", shop=shop)
        cls.customer = Customer.objects.create(
            tenant=cls.tenant, first_name="Cust", last_name="One", phone_number="600000001")
        cls.home = Location.objects.create(
            tenant=cls.tenant, name="Home", type="customer", customer=cls.customer,
            address=Address.objects.create(street="Long", building_number="5", city="City"))
        user = User.objects.create_user(
            username="o@example.com", email="o@example.com", password="pw", tenant=cls.tenant)
        cls.owner = Employee.objects.create(
            tenant=cls.tenant, user=user, role="owner", location=cls.shop_location)

        other_tenant = Tenant.objects.create(name="Other", subdomain="other")
        cls.foreign = Location.objects.create(
            tenant=other_tenant, name="Theirs", type="freeform",
            address=Address.objects.create(street="Far", building_number="9", city="Away"))

    def setUp(self):
        self.item = WorkItem.objects.create(
            tenant=self.tenant, description="Broken", customer=self.customer,
            owner=self.owner, dropoff_point=self.shop_location, pickup_point=self.shop_location)

    def patch(self, data):
        request = APIRequestFactory().patch("/")
        request.tenant = self.tenant
        serializer = WorkItemSerializer(
            self.item, data=data, partial=True, context={"request": request, "tenant": self.tenant})
        valid = serializer.is_valid()
        if valid:
            serializer.save()
        self.item.refresh_from_db()
        return valid, serializer.errors

    def test_locations_can_be_changed_by_id_alias(self):
        valid, _ = self.patch({"pickup_point_id": self.home.id, "dropoff_point_id": self.home.id})
        self.assertTrue(valid)
        self.assertEqual((self.item.pickup_point, self.item.dropoff_point), (self.home, self.home))

    def test_locations_can_be_changed_through_the_nested_field(self):
        valid, _ = self.patch({"pickup_point": self.home.id, "dropoff_point": {"id": self.home.id}})
        self.assertTrue(valid)
        self.assertEqual((self.item.pickup_point, self.item.dropoff_point), (self.home, self.home))

    def test_pickup_point_can_be_cleared_but_dropoff_point_cannot(self):
        self.assertTrue(self.patch({"pickup_point_id": None})[0])
        self.assertIsNone(self.item.pickup_point)
        valid, errors = self.patch({"dropoff_point_id": None})
        self.assertFalse(valid)
        self.assertIn("dropoff_point_id", errors)

    def test_another_tenants_location_is_rejected(self):
        valid, errors = self.patch({"dropoff_point_id": self.foreign.id})
        self.assertFalse(valid)
        self.assertIn("dropoff_point_id", errors)
        self.assertEqual(self.item.dropoff_point, self.shop_location)

    def test_unrelated_edit_leaves_locations_alone(self):
        self.assertTrue(self.patch({"comments": "Called the customer"})[0])
        self.assertEqual(self.item.dropoff_point, self.shop_location)
        self.assertEqual(self.item.pickup_point, self.shop_location)
