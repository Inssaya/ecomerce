"""The things an open shop on the internet gets probed for.

Everything here was missing before. The endpoints that most need limiting are
exactly the ones that have to stay open to strangers, and the one that most
needs a real file check is the one that accepts uploads.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import Settings
from app.core.storage import sniff_image
from tests.test_shop_flow import CASABLANCA, shelf_piece

VISITOR = {"X-Visitor-Id": "visitor-alice"}


# ── Configuration that only looks like security ───────────────────────────────


def test_production_refuses_to_start_without_an_issuer() -> None:
    """There is no signing secret to protect any more, and that is the point.

    This used to guard `JWT_SECRET`, because an empty one signed every token
    with the empty string and anybody could mint an owner session in one line.
    Supabase signs the tokens now and this application holds no key at all —
    so the thing that must not be empty is *which project to trust*. With no
    issuer there is no signature to check against and every request would
    arrive unauthenticated.
    """
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        Settings(supabase_url="", environment="production").check()

    # A real one is fine, and outside production an empty one only warns, so
    # tests and local runs are not blocked.
    Settings(supabase_url="https://project.supabase.co", environment="production").check()
    Settings(supabase_url="", environment="development").check()


# ── Headers the browser enforces for us ───────────────────────────────────────


async def test_every_response_carries_the_security_headers(client: AsyncClient) -> None:
    headers = (await client.get("/api/products")).headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    # This API returns JSON and nothing else: nothing it sends should ever be
    # executed or framed.
    assert "default-src 'none'" in headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]


# ── Uploads ───────────────────────────────────────────────────────────────────


def test_an_upload_is_judged_by_its_bytes_not_its_label() -> None:
    """`Content-Type` is a string the client chose. Believing it lets someone
    label an SVG carrying script as `image/jpeg` and have us serve it back
    from our own storage domain."""
    assert sniff_image(b"\xff\xd8\xff\xe0 jpeg") == "image/jpeg"
    assert sniff_image(b"\x89PNG\r\n\x1a\n png") == "image/png"
    assert sniff_image(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"

    assert sniff_image(b'<svg onload="alert(1)">') is None
    assert sniff_image(b"<!DOCTYPE html><script>") is None
    assert sniff_image(b"GIF89a") is None
    assert sniff_image(b"") is None


async def test_a_script_dressed_as_a_photo_is_refused(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"title_en": "Anything", "price": 100},
    )
    refused = await client.post(
        f"/api/admin/products/{created.json()['id']}/media",
        headers=owner_headers,
        # Declared a JPEG, actually an SVG with script in it.
        files={"file": ("piece.jpg", b'<svg onload="alert(1)"/>', "image/jpeg")},
    )
    assert refused.status_code == 415


# ── Rate limits ───────────────────────────────────────────────────────────────


# Password guessing and reset-email flooding were rate limited here, and both
# tests are gone with the endpoints they aimed at. There is no `/auth/login`
# and no `/auth/forgot-password` on this application any more: Supabase holds
# the credential, sends the mail, and throttles both on its own side.
#
# That is a real transfer of responsibility rather than a gap, and it is worth
# naming as one — the shop can no longer prove these limits in its own test
# suite, so the setting to check is Supabase's own rate limiting, in the
# project dashboard, not a number in this repository.
#
# What this suite still proves is the half that stayed: that a token from
# somewhere else is refused, and that holding a valid token is not the same as
# being allowed in. Both are in `test_access_control.py`.


# The rate limit protecting `/api/assistant` from draining the AI budget was
# tested here. That endpoint was the buyer-facing concierge, which is gone —
# and with it the only unauthenticated route that spent money at a provider.
# The owner's copilot is behind `require_owner`, so a stranger cannot reach
# it to run up a bill in the first place.


async def test_orders_cannot_be_flooded(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """There is no stock to run out of, but each fake order is still a write
    the shop pays for — the flood must be capped regardless."""
    piece = await shelf_piece(client, owner_headers)
    body = {
        "full_name": "Flood",
        "phone": "0611111111",
        "address": CASABLANCA,
        "items": [{"product_id": piece["id"], "quantity": 1}],
    }
    codes = [(await client.post("/api/orders", json=body)).status_code for _ in range(14)]
    assert 429 in codes


async def test_custom_requests_are_limited(client: AsyncClient) -> None:
    body = {
        "full_name": "Spam",
        "phone": "0611111111",
        "description": "A bracket for a curved wall, matte black, about 20cm.",
    }
    codes = [(await client.post("/api/requests", json=body)).status_code for _ in range(9)]
    assert 429 in codes


async def test_reading_the_shop_is_never_limited(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Browsing is the thing we want people to do. Limits belong on writes and
    on anything that costs us money — never on looking."""
    await shelf_piece(client, owner_headers)
    codes = [(await client.get("/api/products")).status_code for _ in range(40)]
    assert set(codes) == {200}
