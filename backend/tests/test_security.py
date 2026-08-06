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


def test_production_refuses_to_start_without_a_real_secret() -> None:
    """An empty JWT_SECRET signs every token with the empty string, which lets
    anyone mint an owner token in one line."""
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        Settings(jwt_secret="", environment="production").check()
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        Settings(jwt_secret="short", environment="production").check()

    # A real one is fine, and outside production a weak one only warns, so
    # tests and local runs are not blocked.
    Settings(jwt_secret="x" * 64, environment="production").check()
    Settings(jwt_secret="", environment="development").check()


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
        json={"kind": "shelf", "title_en": "Anything", "price": 100},
    )
    refused = await client.post(
        f"/api/admin/products/{created.json()['id']}/media",
        headers=owner_headers,
        # Declared a JPEG, actually an SVG with script in it.
        files={"file": ("piece.jpg", b'<svg onload="alert(1)"/>', "image/jpeg")},
    )
    assert refused.status_code == 415


# ── Rate limits ───────────────────────────────────────────────────────────────


async def test_passwords_cannot_be_guessed_forever(client: AsyncClient) -> None:
    """The owner's password is the whole shop."""
    attempts = [
        await client.post(
            "/api/auth/login",
            json={"email": "workshop@mostyle.ma", "password": f"guess-{index}"},
        )
        for index in range(12)
    ]
    codes = [attempt.status_code for attempt in attempts]
    assert 429 in codes, "unlimited password guesses"
    assert codes.index(429) >= 5, "a real person mistyping twice must not be locked out"
    assert attempts[codes.index(429)].headers.get("Retry-After")


async def test_a_correct_sign_in_forgives_the_earlier_mistakes(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Someone who mistyped this morning must not still be counted now."""
    for _ in range(3):
        await client.post(
            "/api/auth/login",
            json={"email": "workshop@mostyle.ma", "password": "wrong"},
        )
    good = await client.post(
        "/api/auth/login",
        json={"email": "workshop@mostyle.ma", "password": "a-long-enough-password"},
    )
    assert good.status_code == 200

    # The counter was cleared, so there is room to be human again.
    again = await client.post(
        "/api/auth/login", json={"email": "workshop@mostyle.ma", "password": "wrong"}
    )
    assert again.status_code == 401


async def test_the_assistant_cannot_be_used_to_empty_the_ai_budget(
    client: AsyncClient,
) -> None:
    """Unauthenticated, and every call spends money at a provider."""
    codes = [
        (
            await client.post(
                "/api/assistant",
                headers=VISITOR,
                json={"messages": [{"role": "user", "content": "hello"}]},
            )
        ).status_code
        for _ in range(35)
    ]
    assert 429 in codes


async def test_orders_cannot_be_flooded(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Each fake order reserves real pieces, so a flood would show the shop as
    sold out while nothing had been sold."""
    piece = await shelf_piece(client, owner_headers, made=1)
    body = {
        "full_name": "Flood",
        "phone": "0611111111",
        "address": CASABLANCA,
        "items": [{"product_id": piece["id"], "quantity": 1}],
    }
    codes = [(await client.post("/api/orders", json=body)).status_code for _ in range(14)]
    assert 429 in codes


async def test_the_reset_email_is_not_a_cannon(client: AsyncClient) -> None:
    """Otherwise it is free mail aimed at anyone whose address you know."""
    codes = [
        (
            await client.post(
                "/api/auth/forgot-password", json={"email": "workshop@mostyle.ma"}
            )
        ).status_code
        for _ in range(8)
    ]
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
