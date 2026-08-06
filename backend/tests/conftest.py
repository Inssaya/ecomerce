"""Test fixtures.

The tests run against a real Postgres — the schema uses foreign keys, row
locks and enum types, and none of those behave the same on SQLite, so testing
against SQLite would be testing a different application. Set `TEST_DATABASE_URL`
to point at a throwaway database.

The two things that are genuinely external — object storage and the SMTP
server — are replaced, because a test should not need MinIO running to check
that checkout arithmetic is right.
"""
from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from contextlib import suppress

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

os.environ.setdefault("JWT_SECRET", "test-secret-not-used-in-production")
# The rate limiter counts in Redis and fails open when it cannot reach one, so
# without this the limit tests would silently pass by never limiting anything.
os.environ.setdefault("REDIS_URL", os.environ.get("TEST_REDIS_URL", "redis://127.0.0.1:6379/1"))
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://mostyle:mostyle@127.0.0.1:5432/mostyle"),
)

from app.core import storage  # noqa: E402
from app.core.cache import close_redis, get_redis  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.modules.notify import email as email_module  # noqa: E402


@pytest.fixture(autouse=True)
def _no_external_services(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_upload(data: bytes, content_type: str, *, prefix: str) -> str:
        return f"http://storage.test/{prefix}/photo.jpg"

    async def fake_delete(url: str) -> None:
        return None

    async def fake_send(to: str, subject: str, html: str) -> bool:
        return True

    monkeypatch.setattr(storage, "upload_image", fake_upload)
    monkeypatch.setattr(storage, "delete_object", fake_delete)
    monkeypatch.setattr("app.modules.catalog.routes.upload_image", fake_upload)
    monkeypatch.setattr("app.modules.catalog.routes.delete_object", fake_delete)
    monkeypatch.setattr(email_module, "send_email", fake_send)


@pytest.fixture
async def clean_db() -> AsyncGenerator[None, None]:
    """An empty database, and a connection pool that belongs to this test.

    pytest-asyncio gives each test its own event loop, and a pooled asyncpg
    connection is bound to the loop that opened it — so the pool is disposed at
    the end of every test rather than handing the next one a connection whose
    loop has closed.
    """
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(
            text(
                "TRUNCATE request_events, custom_requests, order_events, order_items, orders, "
                "piece_alerts, pieces, product_variants, "
                "product_embeddings, product_media, products, signals, feed_weights, categories, "
                "cities, services, "
                "notifications, refresh_tokens, users RESTART IDENTITY CASCADE"
            )
        )
    # Counters are per-test: a limit tripped in one test must not spill into
    # the next, and a test that expects to be limited must start from zero.
    with suppress(Exception):
        await get_redis().flushdb()
    yield
    await close_redis()
    await engine.dispose()


@pytest.fixture
async def client(clean_db: None) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


@pytest.fixture
async def owner_token(client: AsyncClient) -> str:
    from app.cli import seed_owner

    await seed_owner("workshop@mostyle.ma", "a-long-enough-password", "The Workshop")
    response = await client.post(
        "/api/auth/login",
        json={"email": "workshop@mostyle.ma", "password": "a-long-enough-password"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def owner_headers(owner_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {owner_token}"}


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session
