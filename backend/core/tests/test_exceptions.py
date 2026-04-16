from django.test import TestCase
from rest_framework.test import APIRequestFactory
from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework.views import exception_handler
from core.exceptions import json_exception_handler
from rest_framework.exceptions import NotFound, AuthenticationFailed
import json


class JsonExceptionHandlerTest(TestCase):

    def _make_context(self):
        factory = APIRequestFactory()
        request = factory.get('/')
        return {'request': request, 'view': None}

    def test_404_returns_json_detail(self):
        exc = NotFound()
        response = json_exception_handler(exc, self._make_context())
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 404)
        self.assertIn('detail', response.data)

    def test_401_returns_json_detail(self):
        exc = AuthenticationFailed()
        response = json_exception_handler(exc, self._make_context())
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 401)
        self.assertIn('detail', response.data)

    def test_unhandled_exception_returns_500_json(self):
        exc = Exception("boom")
        response = json_exception_handler(exc, self._make_context())
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data.get('detail'), 'Internal server error.')
