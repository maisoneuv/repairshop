"""Image ingest helpers for the Photo feature.

Phone photos arrive large, sideways, and carrying GPS/EXIF metadata. Every
uploaded image is normalized here before storage:
  - orientation baked in from EXIF, then all EXIF stripped (privacy)
  - downscaled to a sane max dimension (raw 12MP+ camera output is wasteful)
  - re-encoded, and a small thumbnail produced for gallery views

Pillow is already a project dependency (see requirements.txt).
"""
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

# iPhones shoot HEIC by default; stock Pillow can't decode it. Registering the
# opener lets Image.open() handle HEIC/HEIF transparently (we still re-encode to
# JPEG on the way out, so nothing downstream needs to know about HEIC).
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:  # pragma: no cover - HEIC just won't be supported
    pass

# Tunables — kept module-level so they're easy to find/adjust.
MAX_DIMENSION = 2560          # longest edge of the stored full image
THUMBNAIL_DIMENSION = 300     # longest edge of the gallery thumbnail
JPEG_QUALITY = 85
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB per photo
ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP', 'HEIF', 'HEIC', 'MPO'}


class InvalidImageError(ValueError):
    """Raised when an upload isn't a usable image or violates limits."""


def process_upload(django_file):
    """Validate + normalize an uploaded image.

    Returns a dict with normalized ``image`` and ``thumbnail`` ContentFiles
    plus ``width``, ``height``, ``mime_type``, ``size``. Raises
    InvalidImageError on anything not a supported, in-limits image.
    """
    if django_file.size and django_file.size > MAX_UPLOAD_BYTES:
        raise InvalidImageError(
            f"Image exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)}MB limit."
        )

    try:
        img = Image.open(django_file)
        img.verify()  # cheap integrity check; consumes the file object
        django_file.seek(0)
        img = Image.open(django_file)
    except Exception as exc:  # noqa: BLE001 — Pillow raises many types here
        raise InvalidImageError("File is not a valid image.") from exc

    if img.format and img.format.upper() not in ALLOWED_FORMATS:
        raise InvalidImageError(f"Unsupported image format: {img.format}.")

    # Bake EXIF orientation into pixels, then drop all metadata by copying the
    # pixel data into a fresh image (transpose already discards the exif dict).
    img = ImageOps.exif_transpose(img)

    if img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')

    full = _fit(img, MAX_DIMENSION)
    thumb = _fit(img, THUMBNAIL_DIMENSION)

    full_bytes = _encode_jpeg(full)
    thumb_bytes = _encode_jpeg(thumb)

    return {
        'image': ContentFile(full_bytes, name='image.jpg'),
        'thumbnail': ContentFile(thumb_bytes, name='thumb.jpg'),
        'width': full.width,
        'height': full.height,
        'mime_type': 'image/jpeg',
        'size': len(full_bytes),
    }


def _fit(img, max_dim):
    """Return a copy scaled so its longest edge is <= max_dim (never upscales)."""
    copy = img.copy()
    copy.thumbnail((max_dim, max_dim), Image.LANCZOS)
    return copy


def _encode_jpeg(img):
    buf = BytesIO()
    img.save(buf, format='JPEG', quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue()
