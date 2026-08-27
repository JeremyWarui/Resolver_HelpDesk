"""
Making an uploaded file safe and small enough to keep.

Size-capped and type-checked, then images are resized, EXIF-stripped and
recompressed. PDFs and Word documents are stored as uploaded.
"""

import io

from django.core.exceptions import ValidationError

# Measured on what arrives, not on what is stored: the stored size would pass
# or fail a file by how well it happened to compress.
MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_ATTACHMENTS_PER_TICKET = 5
IMAGE_MAX_DIMENSION = 1920
IMAGE_QUALITY = 75

IMAGE_MIME_TYPES = {"image/jpeg", "image/png"}

ALLOWED_MIME_TYPES = IMAGE_MIME_TYPES | {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}


def process_upload(file_obj, content_type: str) -> tuple[bytes, str]:
    """Validate and compress an uploaded file.

    Returns (processed_bytes, final_content_type).
    Raises ValidationError for oversized or disallowed files.
    """
    raw = file_obj.read()

    if len(raw) > MAX_FILE_SIZE:
        mb = len(raw) / 1024 / 1024
        raise ValidationError(f"File exceeds the 10 MB limit ({mb:.1f} MB uploaded).")

    # Browsers append parameters ("image/jpeg; charset=...").
    base_type = content_type.split(";")[0].strip().lower()

    if base_type not in ALLOWED_MIME_TYPES:
        raise ValidationError(f"File type '{base_type}' is not permitted.")

    if base_type in IMAGE_MIME_TYPES:
        return _compress_image(raw, base_type)

    return raw, base_type


def _compress_image(raw: bytes, content_type: str) -> tuple[bytes, str]:
    """Resize and recompress an image. Returns (bytes, final_content_type)."""
    from PIL import Image, ImageOps  # deferred: only image uploads need PIL

    img = Image.open(io.BytesIO(raw))

    # Re-encoding discards EXIF, so bake the rotation into the pixels first.
    img = ImageOps.exif_transpose(img)

    w, h = img.size
    if max(w, h) > IMAGE_MAX_DIMENSION:
        ratio = IMAGE_MAX_DIMENSION / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    if content_type == "image/png":
        has_alpha = img.mode in ("RGBA", "LA") or (
            img.mode == "P" and "transparency" in img.info
        )
        if has_alpha:
            out = io.BytesIO()
            img.save(out, format="PNG", optimize=True)
            return out.getvalue(), "image/png"
        # A screenshot is smaller as JPEG, a flat diagram is not, so try both.
        png_buf = io.BytesIO()
        img.save(png_buf, format="PNG", optimize=True)
        jpg_buf = io.BytesIO()
        img.convert("RGB").save(
            jpg_buf, format="JPEG", quality=IMAGE_QUALITY, optimize=True
        )
        if len(png_buf.getvalue()) <= len(jpg_buf.getvalue()):
            return png_buf.getvalue(), "image/png"
        return jpg_buf.getvalue(), "image/jpeg"

    out = io.BytesIO()
    img.convert("RGB").save(out, format="JPEG", quality=IMAGE_QUALITY, optimize=True)
    return out.getvalue(), "image/jpeg"
