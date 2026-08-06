"""Object storage for photography.

Ported from catalog-service. The MinIO SDK is synchronous, so every call is
pushed to a worker thread rather than blocking the event loop.
"""
from __future__ import annotations

import asyncio
import io
import logging
import uuid

from minio import Minio
from minio.error import S3Error

from app.config import settings

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 12 * 1024 * 1024

#: What the file actually starts with. `Content-Type` on an upload is a string
#: the client chose, so believing it means an attacker can label anything
#: `image/jpeg` — an SVG carrying script, or an HTML page — and have us serve
#: it back from our own storage domain. The bytes cannot be talked into lying.
_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


def sniff_image(data: bytes) -> str | None:
    """The real type of an upload, or None if it is not an image we accept."""
    for signature, mime in _MAGIC:
        if data.startswith(signature):
            return mime
    # WebP is a RIFF container: "RIFF" then four length bytes then "WEBP".
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None

_client: Minio | None = None


def _get_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        )
    return _client


async def ensure_bucket() -> None:
    def _ensure() -> None:
        client = _get_client()
        try:
            if not client.bucket_exists(settings.media_bucket):
                client.make_bucket(settings.media_bucket)
        except S3Error as exc:
            if exc.code != "BucketAlreadyOwnedByYou":
                raise

    await asyncio.to_thread(_ensure)


async def upload_image(data: bytes, content_type: str, *, prefix: str) -> str:
    """Store an image and return the URL the browser will load it from."""
    extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[content_type]
    object_name = f"{prefix}/{uuid.uuid4()}.{extension}"

    def _put() -> None:
        _get_client().put_object(
            settings.media_bucket,
            object_name,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    await asyncio.to_thread(_put)
    scheme = "https" if settings.minio_use_ssl else "http"
    return f"{scheme}://{settings.minio_public_endpoint}/{settings.media_bucket}/{object_name}"


async def delete_object(url: str) -> None:
    """Best effort: a stale file costs storage, a failed request costs a sale."""
    marker = f"/{settings.media_bucket}/"
    if marker not in url:
        return
    object_name = url.split(marker, 1)[1]

    def _remove() -> None:
        _get_client().remove_object(settings.media_bucket, object_name)

    try:
        await asyncio.to_thread(_remove)
    except S3Error as exc:
        logger.warning("Could not remove %s from storage: %s", object_name, exc)
