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

# `TEST_DATABASE_URL` **overrides** DATABASE_URL. It must not be a
# `setdefault`, and this is not a style preference — it destroyed the shop's
# data once.
#
# `clean_db` TRUNCATEs every table. Run inside a container where DATABASE_URL
# already points at the real database, `setdefault` is a no-op: the variable
# is already set, TEST_DATABASE_URL is silently ignored, and the suite wipes
# production. Setting it unconditionally is what makes the throwaway database
# actually take effect.
if os.environ.get("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
else:
    os.environ.setdefault(
        "DATABASE_URL", "postgresql+asyncpg://mostyle:mostyle@127.0.0.1:5432/mostyle_test"
    )

# Last line of defence. Even with the above right, a stray DATABASE_URL that
# does not name a throwaway database must stop the run before the first
# TRUNCATE rather than after it.
_target = os.environ["DATABASE_URL"].rsplit("/", 1)[-1]
if not (_target.endswith("_test") or _target.startswith("test")):
    raise RuntimeError(
        f"Refusing to run: DATABASE_URL points at '{_target}', which is not a test database. "
        "These tests TRUNCATE every table. Set TEST_DATABASE_URL to a throwaway database "
        "whose name ends in '_test'."
    )

from app.core import storage  # noqa: E402
from app.core.cache import close_redis, get_redis  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import SETTINGS_ID  # noqa: E402
from app.modules.notify import email as email_module  # noqa: E402


@pytest.fixture(autouse=True)
def mailbox(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
    """Every message the shop tried to send during one test.

    Autouse, so nothing ever reaches a real SMTP server — but returned rather
    than discarded, because some of what the shop does is only observable in
    what it posts. A password reset is the clearest case: the token exists
    solely inside the link in that email, so a test that cannot read the
    mailbox cannot follow the flow a person follows.
    """
    sent: list[dict[str, str]] = []

    async def fake_upload(data: bytes, content_type: str, *, prefix: str) -> str:
        return f"http://storage.test/{prefix}/photo.jpg"

    async def fake_delete(url: str) -> None:
        return None

    async def fake_send(to: str, subject: str, html: str) -> bool:
        sent.append({"to": to, "subject": subject, "html": html})
        return True

    monkeypatch.setattr(storage, "upload_image", fake_upload)
    monkeypatch.setattr(storage, "delete_object", fake_delete)
    monkeypatch.setattr("app.modules.catalog.routes.upload_image", fake_upload)
    monkeypatch.setattr("app.modules.catalog.routes.delete_object", fake_delete)
    monkeypatch.setattr(email_module, "send_email", fake_send)
    return sent


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

        # Every table the models declare, not a list typed out by hand.
        #
        # The hand-written list was the same fact written down twice, and it
        # drifted both ways: it still named `piece_alerts` months after that
        # table was dropped (which made *every* test error at setup on
        # `UndefinedTableError`), and it had never been updated to include
        # `blocklist`, `security_events`, `product_attributes` or
        # `product_interactions` — so rows in those leaked from one test into
        # the next and the security tests quietly depended on running order.
        # `CASCADE` handles the foreign keys, so ordering does not matter.
        tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
        await connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))

        # `shop_settings` holds exactly one row and the application asserts it
        # exists — it is created and seeded by a migration, and `create_all`
        # does not run migrations. Without this every test that reaches the
        # settings (a `danger`-level security event emailing its recipients,
        # the public contact endpoint) fails on a missing singleton that is
        # never missing in a real deployment.
        await connection.execute(
            text(
                "INSERT INTO shop_settings (id, contact_email, contact_phone, alert_emails) "
                "VALUES (:id, :email, :phone, '')"
            ).bindparams(id=SETTINGS_ID, email="workshop@mostyle.ma", phone="0600000000")
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
