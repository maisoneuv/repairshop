"""Photo attachment tests: ingest pipeline, tenant isolation, QR upload links.

Uses in-memory media storage so no files touch disk during tests.
"""
import io
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from datetime import timedelta
from PIL import Image
from rest_framework.test import APIClient

from core.image_utils import process_upload, InvalidImageError, MAX_DIMENSION
from core.models import Photo, PhotoUploadLink, User
from customers.models import Asset, Customer
from inventory.models import Device
from service.models import Employee, Location, RepairShop
from core.models import Address
from tasks.models import WorkItem
from tenants.models import Tenant


def _jpeg_upload(name='photo.jpg', width=40, height=30):
    buf = io.BytesIO()
    Image.new('RGB', (width, height), (0, 128, 255)).save(buf, format='JPEG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/jpeg')


def _tenant_fixture(subdomain):
    tenant = Tenant.objects.create(name=subdomain, subdomain=subdomain)
    user = User.objects.create_user(
        username=f"user@{subdomain}.test", email=f"user@{subdomain}.test",
        password="pw", tenant=tenant,
    )
    address = Address.objects.create(street="Main", city="Warsaw",
                                     building_number="1", postal_code="00-001")
    shop = RepairShop.objects.create(tenant=tenant, name="Shop", address=address)
    location = Location.objects.create(tenant=tenant, name="Desk", shop=shop)
    employee = Employee.objects.create(tenant=tenant, user=user, role="tech", location=location)
    customer = Customer.objects.create(tenant=tenant, first_name="Jan",
                                       last_name="Kowalski", phone_number="123456789")
    device = Device.objects.create(model="iPhone 12")
    asset = Asset.objects.create(customer=customer, device=device, serial_number="SN1")
    work_item = WorkItem.objects.create(
        tenant=tenant, description="broken screen", customer=customer,
        owner=employee, dropoff_point=location,
    )
    return {"tenant": tenant, "user": user, "customer": customer,
            "asset": asset, "work_item": work_item}


class ImageIngestTests(TestCase):
    def test_resizes_large_image_and_sets_dimensions(self):
        big = SimpleUploadedFile('big.jpg', _jpeg_from(4000, 3000), content_type='image/jpeg')
        out = process_upload(big)
        self.assertLessEqual(max(out['width'], out['height']), MAX_DIMENSION)
        self.assertEqual(out['mime_type'], 'image/jpeg')
        self.assertTrue(out['thumbnail'])

    def test_rejects_non_image(self):
        bad = SimpleUploadedFile('notes.txt', b'hello world', content_type='text/plain')
        with self.assertRaises(InvalidImageError):
            process_upload(bad)

    def test_accepts_iphone_heic(self):
        # iPhone photos are HEIC by default; must ingest and normalize to JPEG.
        buf = io.BytesIO()
        Image.new('RGB', (1200, 900), (30, 140, 200)).save(buf, format='HEIF')
        up = SimpleUploadedFile('IMG_0001.HEIC', buf.getvalue(), content_type='image/heic')
        out = process_upload(up)
        self.assertEqual(out['mime_type'], 'image/jpeg')
        self.assertEqual((out['width'], out['height']), (1200, 900))

    def test_strips_exif_orientation(self):
        # Build a JPEG carrying an orientation tag; output must not carry EXIF.
        buf = io.BytesIO()
        img = Image.new('RGB', (60, 40), (10, 20, 30))
        exif = img.getexif()
        exif[0x0112] = 6  # Orientation = rotate 90
        img.save(buf, format='JPEG', exif=exif)
        up = SimpleUploadedFile('rot.jpg', buf.getvalue(), content_type='image/jpeg')
        out = process_upload(up)
        result = Image.open(io.BytesIO(out['image'].read()))
        self.assertFalse(dict(result.getexif()))  # no EXIF retained


def _jpeg_from(width, height):
    buf = io.BytesIO()
    Image.new('RGB', (width, height), (200, 100, 50)).save(buf, format='JPEG')
    return buf.getvalue()


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PhotoApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = _tenant_fixture("tenant-a")
        cls.b = _tenant_fixture("tenant-b")

    def setUp(self):
        self.client = APIClient()

    def _auth(self, fixture):
        self.client.force_authenticate(user=fixture["user"])
        return {"HTTP_X_TENANT": fixture["tenant"].subdomain}

    def test_upload_and_list_photo_on_workitem(self):
        hdr = self._auth(self.a)
        wid = self.a["work_item"].id
        resp = self.client.post(
            f"/api/core/photos/workitem/{wid}/",
            {"images": _jpeg_upload(), "category": "intake"},
            format="multipart", **hdr,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(len(resp.data["photos"]), 1)
        self.assertEqual(resp.data["photos"][0]["category"], "intake")

        listing = self.client.get(f"/api/core/photos/workitem/{wid}/", **hdr)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 1)

    def test_upload_to_asset(self):
        hdr = self._auth(self.a)
        aid = self.a["asset"].id
        resp = self.client.post(
            f"/api/core/photos/asset/{aid}/", {"images": _jpeg_upload()},
            format="multipart", **hdr,
        )
        self.assertEqual(resp.status_code, 201, resp.content)

    def test_cross_tenant_upload_is_404(self):
        # Tenant B authenticated, targeting tenant A's work item.
        hdr = self._auth(self.b)
        wid = self.a["work_item"].id
        resp = self.client.post(
            f"/api/core/photos/workitem/{wid}/", {"images": _jpeg_upload()},
            format="multipart", **hdr,
        )
        self.assertEqual(resp.status_code, 404)

    def test_cross_tenant_list_is_404(self):
        hdr = self._auth(self.b)
        wid = self.a["work_item"].id
        resp = self.client.get(f"/api/core/photos/workitem/{wid}/", **hdr)
        self.assertEqual(resp.status_code, 404)

    def test_anonymous_upload_rejected(self):
        wid = self.a["work_item"].id
        resp = self.client.post(
            f"/api/core/photos/workitem/{wid}/", {"images": _jpeg_upload()},
            format="multipart", HTTP_X_TENANT=self.a["tenant"].subdomain,
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_soft_delete_hides_from_list_but_keeps_row(self):
        hdr = self._auth(self.a)
        wid = self.a["work_item"].id
        self.client.post(f"/api/core/photos/workitem/{wid}/",
                         {"images": _jpeg_upload()}, format="multipart", **hdr)
        photo = Photo.objects.get(tenant=self.a["tenant"])
        resp = self.client.delete(f"/api/core/photos/{photo.id}/", **hdr)
        self.assertEqual(resp.status_code, 204)
        photo.refresh_from_db()
        self.assertIsNotNone(photo.deleted_at)  # row preserved (evidence)
        listing = self.client.get(f"/api/core/photos/workitem/{wid}/", **hdr)
        self.assertEqual(len(listing.data), 0)

    def test_serve_file_requires_matching_tenant(self):
        hdr_a = self._auth(self.a)
        wid = self.a["work_item"].id
        self.client.post(f"/api/core/photos/workitem/{wid}/",
                         {"images": _jpeg_upload()}, format="multipart", **hdr_a)
        photo = Photo.objects.get(tenant=self.a["tenant"])

        ok = self.client.get(f"/api/core/photos/{photo.id}/file/", **hdr_a)
        self.assertEqual(ok.status_code, 200)

        # Tenant B must not fetch tenant A's file.
        hdr_b = self._auth(self.b)
        denied = self.client.get(f"/api/core/photos/{photo.id}/file/", **hdr_b)
        self.assertEqual(denied.status_code, 404)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PhotoUploadLinkTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = _tenant_fixture("tenant-a")

    def setUp(self):
        self.client = APIClient()

    def _auth(self):
        self.client.force_authenticate(user=self.a["user"])
        return {"HTTP_X_TENANT": self.a["tenant"].subdomain}

    def _create_link(self):
        hdr = self._auth()
        resp = self.client.post(
            "/api/core/photo-upload-links/",
            {"model": "workitem", "object_id": self.a["work_item"].id},
            format="json", **hdr,
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        return resp.data["token"]

    def test_create_link_returns_plaintext_token_once(self):
        token = self._create_link()
        self.assertTrue(token.startswith("put_"))
        link = PhotoUploadLink.objects.get(tenant=self.a["tenant"])
        # Only the hash is stored — plaintext must not equal the stored value.
        self.assertNotEqual(link.token_hash, token)
        self.assertTrue(link.check_token(token))

    def test_mobile_upload_with_token_no_session(self):
        token = self._create_link()
        anon = APIClient()  # no auth, no tenant header — the token is everything
        resp = anon.post(
            f"/api/core/photo-upload-links/{token}/photos/",
            {"images": _jpeg_upload()}, format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertEqual(resp.data["uploaded"], 1)
        photo = Photo.objects.get(tenant=self.a["tenant"])
        self.assertEqual(photo.uploaded_via, "mobile_link")

    def test_expired_token_rejected(self):
        token = self._create_link()
        PhotoUploadLink.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        anon = APIClient()
        resp = anon.post(
            f"/api/core/photo-upload-links/{token}/photos/",
            {"images": _jpeg_upload()}, format="multipart",
        )
        self.assertEqual(resp.status_code, 404)

    def test_bogus_token_rejected(self):
        anon = APIClient()
        resp = anon.post(
            "/api/core/photo-upload-links/put_not-a-real-token/photos/",
            {"images": _jpeg_upload()}, format="multipart",
        )
        self.assertEqual(resp.status_code, 404)
