import asyncio
import io
import uuid

from minio import Minio
from minio.error import S3Error

from app.config import settings

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


async def ensure_bucket(bucket: str) -> None:
    def _check():
        client = _get_client()
        try:
            if not client.bucket_exists(bucket):
                client.make_bucket(bucket)
        except S3Error as exc:
            if exc.code != "BucketAlreadyOwnedByYou":
                raise

    await asyncio.to_thread(_check)


async def upload_bytes(data: bytes, content_type: str, prefix: str = "products") -> str:
    ext = content_type.split("/")[-1]
    object_name = f"{prefix}/{uuid.uuid4()}.{ext}"

    def _put():
        client = _get_client()
        client.put_object(
            settings.media_bucket,
            object_name,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    await asyncio.to_thread(_put)
    return f"http://{settings.minio_endpoint}/{settings.media_bucket}/{object_name}"
