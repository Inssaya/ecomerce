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

    async def fake_send(to: str, subject: str, html: str) -> bool:
        sent.append({"to": to, "subject": subject, "html": html})
        return True

    monkeypatch.setattr(email_module, "send_email", fake_send)
    return sent


#: Storage, as a dictionary.
#:
#: Photographs no longer travel through the API — the browser writes them
#: straight to the bucket and hands back a name — so a test that wants to
#: upload has to stand in for the bucket as well as for the browser. This is
#: that bucket, cleared between tests.
FAKE_OBJECTS: dict[str, bytes] = {}


@pytest.fixture(autouse=True)
def fake_storage(monkeypatch: pytest.MonkeyPatch) -> dict[str, bytes]:
    """A stand-in bucket that still checks what it was handed.

    Deliberately not a stub that says yes. The reason the API reads an
    upload's first bytes is that the declared content type is a string the
    client chose — an SVG carrying script can call itself `image/jpeg`, and
    serving it back from our own domain is the attack. `verify_uploaded` is
    what enforces that, and there are tests that exist purely to prove it
    does, so the fake sniffs the real bytes with the real sniffer and applies
    the real ceiling. Only the network is fake.
    """
    FAKE_OBJECTS.clear()

    async def fake_presigned_put(key: str, *, expires_seconds: int = 600) -> str:
        return f"https://storage.test/{key}"

    async def fake_verify(key: str, *, max_bytes: int) -> str:
        data = FAKE_OBJECTS.get(key)
        if data is None:
            raise storage.UploadRejected("That upload did not arrive")
        if not data:
            raise storage.UploadRejected("That file is empty")
        if len(data) > max_bytes:
            FAKE_OBJECTS.pop(key, None)
            raise storage.UploadRejected(f"That file is larger than {max_bytes // (1024 * 1024)} MB")
        content_type = storage.sniff_image(data)
        if content_type is None:
            FAKE_OBJECTS.pop(key, None)
            raise storage.UploadRejected("Photos must be JPEG, PNG or WebP")
        return content_type

    async def fake_delete(url: str) -> None:
        FAKE_OBJECTS.pop(url.removeprefix("/media/"), None)

    monkeypatch.setattr(storage, "presigned_put", fake_presigned_put)
    monkeypatch.setattr(storage, "verify_uploaded", fake_verify)
    monkeypatch.setattr(storage, "delete_object", fake_delete)
    # These modules imported the names directly, so patching the module they
    # came from would leave the already-bound references pointing at the real
    # ones — the same trap the Supabase stub above documents.
    for target in (
        "app.modules.catalog.routes",
        "app.modules.requests.routes",
        "app.modules.auth.routes",
    ):
        monkeypatch.setattr(f"{target}.verify_uploaded", fake_verify, raising=False)
        monkeypatch.setattr(f"{target}.delete_object", fake_delete, raising=False)
    return FAKE_OBJECTS


async def upload_photo(
    client: AsyncClient,
    data: bytes,
    *,
    purpose: str,
    headers: dict[str, str] | None = None,
) -> str:
    """Do what the browser does: ask for a URL, write the bytes, keep the name.

    Returns the storage key, which is what the claim endpoints take.
    """
    path = {
        "product": "/api/uploads/sign",
        "category": "/api/uploads/sign",
        "avatar": "/api/uploads/sign/avatar",
        "reference": "/api/uploads/sign/reference",
    }[purpose]
    signed = await client.post(
        path,
        headers=headers or {},
        json={"purpose": purpose, "content_type": "image/png"},
    )
    assert signed.status_code == 200, signed.text
    key = signed.json()["key"]
    FAKE_OBJECTS[key] = data  # the PUT the browser would have made
    return key


@pytest.fixture
async def clean_db() -> AsyncGenerator[None, None]:
    """An empty database, and a connection pool that belongs to this test.

    pytest-asyncio gives each test its own event loop, and a pooled asyncpg
    connection is bound to the loop that opened it — so the pool is disposed at
    the end of every test rather than handing the next one a connection whose
    loop has closed.
    """
    # Start from a pool this loop owns. Teardown disposes too, but a dispose
    # that raced with asyncpg's cancellation can leave a connection bound to a
    # loop that is now closed — and the failure then lands on *this* test's
    # setup rather than on the one that caused it. Disposing at both ends
    # makes each test independent of how the last one ended.
    with suppress(Exception):
        await engine.dispose()

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
    # Disposing can race with asyncpg cancelling an in-flight command: it
    # schedules the cancel on the loop pytest-asyncio is closing, and raises
    # "Event loop is closed". That is a teardown problem and nothing to do
    # with the test that just ran — but unsuppressed it surfaces as an ERROR
    # at the *setup* of whichever test happens to come next, which sends you
    # looking at innocent code. The pool is going away either way.
    with suppress(Exception):
        await engine.dispose()


@pytest.fixture
async def client(clean_db: None) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


#: A token the tests can mint without a network call.
#:
#: Supabase signs real tokens with a key only Supabase holds, so a test cannot
#: produce one — and should not try: reaching out to a hosted service to check
#: that `/admin/orders` refuses a customer would make the suite slow, flaky and
#: dependent on somebody else's uptime.
#:
#: So the *verification* is stubbed and everything downstream of it is real.
#: `deps.py` still upserts the local row, still reads `role` from the database,
#: and every authorization check under test is the one that runs in production.
#: What is faked is only the signature check, which is Supabase's job to get
#: right and not this suite's to re-prove.
TEST_TOKEN_PREFIX = "test-token:"


def fake_token(user_id: str, email: str) -> str:
    return f"{TEST_TOKEN_PREFIX}{user_id}:{email}"


@pytest.fixture(autouse=True)
def stub_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.supabase_auth import AuthError

    async def _verify(token: str) -> dict:
        if not token.startswith(TEST_TOKEN_PREFIX):
            raise AuthError("Not a test token")
        user_id, email = token[len(TEST_TOKEN_PREFIX) :].split(":", 1)
        return {"sub": user_id, "email": email, "user_metadata": {}}

    # `deps.py` imports the name directly, so patching the module alone would
    # leave the already-bound reference pointing at the real one.
    monkeypatch.setattr("app.core.supabase_auth.verify", _verify)
    monkeypatch.setattr("app.deps.verify", _verify)


OWNER_ID = "00000000-0000-4000-8000-000000000001"
OWNER_EMAIL = "workshop@mostyle.ma"


@pytest.fixture
async def owner_token(client: AsyncClient) -> str:
    """The workshop's own account, promoted the way the CLI promotes it."""
    from app.cli import make_owner

    assert await make_owner(OWNER_EMAIL, OWNER_ID) == 0
    return fake_token(OWNER_ID, OWNER_EMAIL)


@pytest.fixture
def owner_headers(owner_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {owner_token}"}


CUSTOMER_ID = "00000000-0000-4000-8000-000000000002"
CUSTOMER_EMAIL = "shopper@example.com"


@pytest.fixture
def customer_headers() -> dict[str, str]:
    """A signed-in shopper. The row is created on first use, as in production."""
    return {"Authorization": f"Bearer {fake_token(CUSTOMER_ID, CUSTOMER_EMAIL)}"}


@pytest.fixture
async def db_session():
    async with SessionLocal() as session:
        yield session
