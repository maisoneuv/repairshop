from django.test import SimpleTestCase

from core.phone_search import normalize_phone_query


class NormalizePhoneQueryTests(SimpleTestCase):
    """The search box is where staff paste numbers straight from a phone."""

    def test_strips_country_code_written_with_plus(self):
        self.assertEqual(normalize_phone_query('+48123123123'), '123123123')

    def test_strips_country_code_written_without_plus(self):
        self.assertEqual(normalize_phone_query('48123123123'), '123123123')

    def test_removes_separators_from_a_local_number(self):
        self.assertEqual(normalize_phone_query('123 123 123'), '123123123')
        self.assertEqual(normalize_phone_query('123-123-123'), '123123123')
        self.assertEqual(normalize_phone_query('(12) 345 67 89'), '123456789')

    def test_keeps_a_number_that_is_already_local(self):
        self.assertEqual(normalize_phone_query('123123123'), '123123123')

    def test_accepts_the_shortest_valid_number(self):
        # Customer.phone_number allows 7 to 9 digits.
        self.assertEqual(normalize_phone_query('123 45 67'), '1234567')

    def test_leaves_a_reference_id_alone(self):
        # The same box searches work items, so RMA numbers pass through it.
        self.assertEqual(normalize_phone_query('RMA-2026-1234'), 'RMA-2026-1234')

    def test_leaves_a_name_alone(self):
        self.assertEqual(normalize_phone_query('Kowalski'), 'Kowalski')

    def test_leaves_a_digit_string_too_short_to_be_a_number_alone(self):
        # A house number or a fragment someone is still typing.
        self.assertEqual(normalize_phone_query('12345'), '12345')

    def test_handles_empty_and_missing_input(self):
        self.assertEqual(normalize_phone_query(''), '')
        self.assertIsNone(normalize_phone_query(None))

    def test_ignores_surrounding_whitespace(self):
        self.assertEqual(normalize_phone_query('  +48 123 123 123  '), '123123123')

    def test_documents_the_known_limitation_for_foreign_numbers(self):
        # A US number keeps its last 9 digits, which is not the local form
        # anywhere. Recorded deliberately: this is why the module is temporary.
        self.assertEqual(normalize_phone_query('+1 555 123 4567'), '551234567')
