"""Object storage for photography.

Ported from catalog-service. The MinIO SDK is synchronous, so every call is
pushed to a worker thread rather than blocking the event loop.
"""
from __future__ import annotations

import asyncio
import io
import json
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

#: The public path every stored file is served under.
#:
#: Deliberately **not** the bucket name. The URL used to be built as
#: `/{bucket}/{object}`, which quietly made the bucket's name part of the
#: shop's public contract: every row in the database begins `/media/`, and the
#: web server rewrites `/media/*` to storage. Moving from a MinIO bucket
#: called "media" to an R2 bucket called "ecomerce" would have started writing
#: `/ecomerce/...` — URLs that match no rewrite and no existing row, for no
#: reason other than what somebody typed in a storage dashboard.
#:
#: So the bucket is an implementation detail and this is the contract. The
#: object key is identical on both sides of the prefix, so the rewrite target
#: needs no path rewriting either.
MEDIA_URL_PREFIX = "media"

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


def _read_only_policy(bucket: str) -> str:
    """Anyone may read one object. Nobody may list the bucket.

    Both halves matter.

    Product photographs are public by definition — the URL goes into an
    `<img>`, into an og:image WhatsApp fetches, and into structured data
    Google fetches, none of which carry credentials. A bucket left at MinIO's
    default of fully private serves 403 to every one of them, which shows as a
    shop with no photographs and no error anywhere.

    But `GetObject` is the *only* thing granted. `ListBucket` would turn the
    media host into a directory of everything the workshop has ever uploaded —
    including photographs on drafts that were never published and pieces that
    were withdrawn — reachable by anyone who guesses the bucket URL.
    """
    return json.dumps(
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{bucket}/*"],
                }
            ],
        }
    )


async def ensure_bucket() -> None:
    """Make sure the bucket exists and serves reads.

    Both halves are best-effort against a managed provider, and deliberately
    so. On MinIO — one container we own — creating the bucket and stamping the
    read-only policy is the whole setup, and failing loudly is right.

    Cloudflare R2 is S3-compatible for objects but not for administration: it
    answers `PutBucketPolicy` with `NotImplemented`, because public read is a
    property of the bucket's *domain* there, switched on in the dashboard as a
    public r2.dev URL or a custom domain. Treating that refusal as fatal would
    mean the shop refuses to start against the storage it is actually
    deployed on, over a call that was never going to do anything.

    So an unimplemented admin call is logged and stepped over. A genuine
    failure to reach storage still surfaces on the first upload, which is the
    honest place for it — that is a real request failing, not a guess made at
    boot.
    """

    def _ensure() -> None:
        client = _get_client()
        try:
            if not client.bucket_exists(settings.media_bucket):
                client.make_bucket(settings.media_bucket)
        except S3Error as exc:
            # `NotImplemented` / `MethodNotAllowed`: a managed bucket that
            # already exists and is not ours to create.
            if exc.code not in ("BucketAlreadyOwnedByYou", "NotImplemented", "MethodNotAllowed"):
                raise

        try:
            client.set_bucket_policy(
                settings.media_bucket, _read_only_policy(settings.media_bucket)
            )
        except S3Error as exc:
            if exc.code not in ("NotImplemented", "MethodNotAllowed", "AccessDenied"):
                raise
            logger.info(
                "Storage does not support bucket policies (%s). Public read must be "
                "configured on the provider — for R2 that is a public r2.dev URL or a "
                "custom domain on the '%s' bucket.",
                exc.code,
                settings.media_bucket,
            )

    await asyncio.to_thread(_ensure)


async def upload_image(data: bytes, content_type: str, *, prefix: str) -> str:
    """Store an image and return the path the browser will load it from.

    The returned URL is deliberately **relative** — `/media/…` — because the
    web server proxies `/media/*` to MinIO on whatever host the visitor is
    actually using. An absolute one is wrong the moment the host is not the
    one that happened to be configured when the row was written: every image
    stored here used to begin `http://localhost:3000`, so opening the shop
    from a phone on the same network, or from the real domain, loaded nothing
    at all — the browser looked for `localhost` on the visitor's own machine.
    A relative path is correct on every host at once, and it means the
    database survives a domain change without a rewrite.

    Where an absolute URL is genuinely needed — OpenGraph and JSON-LD — Next
    resolves it against `metadataBase`, and email links are built from
    `settings.app_url` rather than from here.
    """
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
    return f"/{MEDIA_URL_PREFIX}/{object_name}"


async def delete_object(url: str) -> None:
    """Best effort: a stale file costs storage, a failed request costs a sale."""
    # Accepts both shapes: the current `/media/<key>` and anything still
    # stored as `/<bucket>/<key>` from before the two were separated.
    for marker in (f"/{MEDIA_URL_PREFIX}/", f"/{settings.media_bucket}/"):
        if marker in url:
            object_name = url.split(marker, 1)[1]
            break
    else:
        return

    def _remove() -> None:
        _get_client().remove_object(settings.media_bucket, object_name)

    try:
        await asyncio.to_thread(_remove)
    except S3Error as exc:
        logger.warning("Could not remove %s from storage: %s", object_name, exc)
