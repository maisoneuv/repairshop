"""
Two-tenant isolation tests (architecture review finding 1.1).

Creates tenants A and B with one row each of the highest-risk models and
asserts that tenant A's users can never read or write tenant B's rows
through the API — lists exclude them, detail/PATCH return 404, and a
client-supplied "tenant" field is ignored on create.
"""
from django.contrib.auth.models import Permission
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import (
    Address, APIKey, EmailTemplate, Role, RolePermission, User, UserRole,
)
from customers.models import Customer
from documents.models import FormTemplate
from inventory.models import InventoryItem
from service.models import Employee, Location, RepairShop
from tasks.models import WorkItem
from tenants.models import Tenant

PERMISSION_CODENAMES = [
    'view_all_customers',
    'add_customer',
    'change_customer',
    'view_all_workitems',
]


def _build_tenant(letter):
    """Create a tenant with a user (granted broad permissions), and one row
    of each model under test."""
    tenant = Tenant.objects.create(name=f"Tenant {letter}", subdomain=f"tenant-{letter}")

    user = User.objects.create_user(
        username=f"user-{letter}@example.com",
        email=f"user-{letter}@example.com",
        password="test-password",
        tenant=tenant,
    )
    role = Role.objects.create(name=f"Staff {letter}", tenant=tenant)
    for codename in PERMISSION_CODENAMES:
        perm = Permission.objects.filter(codename=codename).first()
        if perm:
            RolePermission.objects.create(role=role, permission=perm)
    UserRole.objects.create(user=user, role=role)

    customer = Customer.objects.create(
        tenant=tenant,
        first_name=f"Cust{letter}",
        last_name="Isolation",
        phone_number=f"60000000{1 if letter == 'a' else 2}",
    )

    address = Address.objects.create(
        street="Test St", building_number="1", city="TestCity", postal_code="00-001",
    )
    shop = RepairShop.objects.create(
        tenant=tenant, name=f"Shop {letter}", type="internal", address=address,
    )
    location = Location.objects.create(
        tenant=tenant, name=f"Loc {letter}", type="shop", shop=shop,
    )
    employee = Employee.objects.create(
        tenant=tenant, user=user, role="technician", location=location,
    )
    work_item = WorkItem.objects.create(
        tenant=tenant,
        customer=customer,
        description=f"Repair {letter}",
        owner=employee,
        dropoff_point=location,
    )

    email_template = EmailTemplate.objects.create(
        tenant=tenant, name=f"Template {letter}", subject="Hi", body_html="<p>Hi</p>",
    )
    form_template = FormTemplate.objects.create(
        tenant=tenant, name=f"Form {letter}", form_type=FormTemplate.FORM_TYPE_INTAKE,
        html_content="<p>Form</p>",
    )
    inventory_item = InventoryItem.objects.create(
        tenant=tenant, name=f"Part {letter}", sku=f"SKU-{letter}",
    )

    return {
        'tenant': tenant,
        'user': user,
        'role': role,
        'customer': customer,
        'work_item': work_item,
        'email_template': email_template,
        'form_template': form_template,
        'inventory_item': inventory_item,
    }


class TenantIsolationTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = _build_tenant('a')
        cls.b = _build_tenant('b')

    def client_for(self, bundle):
        client = APIClient()
        client.force_authenticate(user=bundle['user'])
        # force_authenticate acts at the DRF layer, after TenantMiddleware has
        # run; the header is what resolves request.tenant (as in real clients).
        # Cross-tenant escape via this header is covered separately below.
        client.credentials(HTTP_X_TENANT=bundle['tenant'].subdomain)
        return client

    # ── list endpoints ────────────────────────────────────────────────

    def assert_list_only_own(self, endpoint, own_id, foreign_id):
        resp = self.client_for(self.a).get(endpoint)
        self.assertEqual(resp.status_code, 200, f"{endpoint}: {resp.status_code}")
        data = resp.json()
        results = data.get('results', data) if isinstance(data, dict) else data
        ids = [row['id'] for row in results]
        self.assertIn(own_id, ids, f"{endpoint} missing own row")
        self.assertNotIn(foreign_id, ids, f"{endpoint} leaked tenant B row")

    def test_customer_list_scoped(self):
        self.assert_list_only_own(
            '/api/customers/api/customers/',
            self.a['customer'].id, self.b['customer'].id,
        )

    def test_workitem_list_scoped(self):
        self.assert_list_only_own(
            '/api/tasks/work-items/',
            self.a['work_item'].id, self.b['work_item'].id,
        )

    def test_role_list_scoped(self):
        self.assert_list_only_own(
            '/api/core/roles/', self.a['role'].id, self.b['role'].id,
        )

    def test_user_list_scoped(self):
        self.assert_list_only_own(
            '/api/core/users/', self.a['user'].id, self.b['user'].id,
        )

    def test_email_template_list_scoped(self):
        self.assert_list_only_own(
            '/api/core/email-templates/',
            self.a['email_template'].id, self.b['email_template'].id,
        )

    def test_form_template_list_scoped(self):
        self.assert_list_only_own(
            '/api/documents/templates/',
            self.a['form_template'].id, self.b['form_template'].id,
        )

    def test_inventory_item_list_scoped(self):
        self.assert_list_only_own(
            '/api/inventory/api/items/',
            self.a['inventory_item'].id, self.b['inventory_item'].id,
        )

    # ── detail / write endpoints ──────────────────────────────────────

    def test_foreign_customer_detail_is_404(self):
        resp = self.client_for(self.a).get(
            f"/api/customers/api/customers/{self.b['customer'].id}/"
        )
        self.assertEqual(resp.status_code, 404)

    def test_foreign_workitem_detail_is_404(self):
        resp = self.client_for(self.a).get(
            f"/api/tasks/work-items/{self.b['work_item'].id}/"
        )
        self.assertEqual(resp.status_code, 404)

    def test_foreign_customer_patch_is_404(self):
        resp = self.client_for(self.a).patch(
            f"/api/customers/api/customers/{self.b['customer'].id}/",
            {'first_name': 'Hacked'},
            format='json',
        )
        self.assertEqual(resp.status_code, 404)
        self.b['customer'].refresh_from_db()
        self.assertNotEqual(self.b['customer'].first_name, 'Hacked')

    def test_create_ignores_client_supplied_tenant(self):
        resp = self.client_for(self.a).post(
            '/api/customers/api/customers/',
            {
                'first_name': 'New',
                'last_name': 'Customer',
                'phone_number': '700700700',
                'tenant': self.b['tenant'].id,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        created = Customer.objects.get(pk=resp.json()['id'])
        self.assertEqual(created.tenant_id, self.a['tenant'].id)

    def test_session_user_cannot_switch_tenant_via_header(self):
        # Real session auth: middleware pins request.tenant to user.tenant,
        # so a spoofed X-Tenant header must not leak tenant B's data.
        client = APIClient()
        self.assertTrue(
            client.login(email=self.a['user'].email, password='test-password')
        )
        resp = client.get(
            '/api/customers/api/customers/',
            HTTP_X_TENANT=self.b['tenant'].subdomain,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        results = data.get('results', data) if isinstance(data, dict) else data
        ids = [row['id'] for row in results]
        self.assertNotIn(self.b['customer'].id, ids)

    # ── superuser X-Tenant switching ──────────────────────────────────

    def test_superuser_with_x_tenant_sees_only_that_tenant(self):
        superuser = User.objects.create_superuser(
            username='root@example.com',
            email='root@example.com',
            password='test-password',
        )
        client = APIClient()
        client.force_authenticate(user=superuser)
        resp = client.get(
            '/api/customers/api/customers/',
            HTTP_X_TENANT=self.b['tenant'].subdomain,
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        results = data.get('results', data) if isinstance(data, dict) else data
        ids = [row['id'] for row in results]
        self.assertIn(self.b['customer'].id, ids)
        self.assertNotIn(self.a['customer'].id, ids)

    # ── API key auth ──────────────────────────────────────────────────

    def test_api_key_scoped_to_its_tenant(self):
        plaintext, prefix, key_hash = APIKey.generate_key()
        APIKey.objects.create(
            tenant=self.a['tenant'],
            role=self.a['role'],
            name='Isolation test key',
            prefix=prefix,
            key_hash=key_hash,
        )
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {plaintext}')
        resp = client.get('/api/customers/api/customers/')
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        results = data.get('results', data) if isinstance(data, dict) else data
        ids = [row['id'] for row in results]
        self.assertIn(self.a['customer'].id, ids)
        self.assertNotIn(self.b['customer'].id, ids)
