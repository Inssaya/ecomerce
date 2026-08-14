"""The things a shop needs that this one did not have.

One of them was a real hole rather than a missing feature: pieces reserved by
an order nobody ever confirmed were held forever, so a handful of abandoned
checkouts would show the shop as sold out while nothing had been sold.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.models import Order, PieceAlert
from tests.test_shop_flow import CASABLANCA, shelf_piece, workshop_piece


async def buy(client: AsyncClient, piece: dict, quantity: int = 1) -> dict:
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Omar T.",
            "phone": "0611111111",
            "address": CASABLANCA,
            "items": [{"product_id": piece["id"], "quantity": quantity}],
        },
    )
    assert order.status_code == 201, order.text
    return order.json()


# ── Abandoned orders must not hold real objects ───────────────────────────────


# ── Getting back to an order without the link ─────────────────────────────────


async def test_an_order_can_be_found_by_reference_and_phone(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """People lose the link. They close the tab, they clear WhatsApp, they
    ordered from a friend's phone."""
    piece = await shelf_piece(client, owner_headers, made=2)
    order = await buy(client, piece)

    found = await client.post(
        "/api/orders/find",
        json={"reference": order["reference"], "phone": "0611111111"},
    )
    assert found.status_code == 200
    assert found.json()["tracking_token"] == order["tracking_token"]

    # A number typed the other way still matches what was stored.
    spaced = await client.post(
        "/api/orders/find",
        json={"reference": order["reference"].lower(), "phone": "+212 611 111 111"},
    )
    assert spaced.status_code == 200


async def test_the_reference_alone_is_not_enough(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Both must match, and both failures give the same answer, so this cannot
    be used to discover which references exist."""
    piece = await shelf_piece(client, owner_headers, made=2)
    order = await buy(client, piece)

    wrong_phone = await client.post(
        "/api/orders/find", json={"reference": order["reference"], "phone": "0699999999"}
    )
    wrong_reference = await client.post(
        "/api/orders/find", json={"reference": "AAAAAAAA", "phone": "0611111111"}
    )
    assert wrong_phone.status_code == wrong_reference.status_code == 404
    assert wrong_phone.json()["detail"] == wrong_reference.json()["detail"]


# ── A sold-out page is not a dead end ─────────────────────────────────────────


async def test_someone_can_ask_to_be_told_when_we_make_another(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    piece = await shelf_piece(client, owner_headers, made=1)
    await buy(client, piece)

    waiting = await client.post(
        f"/api/products/{piece['slug']}/alert",
        json={"phone": "0655555555", "email": "salma@example.ma"},
    )
    assert waiting.status_code == 202

    alert = await db_session.scalar(select(PieceAlert))
    assert alert.phone == "0655555555"
    assert alert.notified_at is None


async def test_asking_twice_is_asking_once(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Nobody should be messaged twice because they tapped the button again."""
    piece = await shelf_piece(client, owner_headers, made=1)
    for _ in range(3):
        response = await client.post(
            f"/api/products/{piece['slug']}/alert", json={"phone": "0655555555"}
        )
        assert response.status_code == 202

    rows = list(await db_session.scalars(select(PieceAlert)))
    assert len(rows) == 1


async def test_everyone_waiting_is_told_when_more_are_made(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Nobody has to remember to do it — adding pieces is what announces."""
    piece = await shelf_piece(client, owner_headers, made=1)
    await buy(client, piece)
    for phone in ("0655555555", "0644444444"):
        await client.post(f"/api/products/{piece['slug']}/alert", json={"phone": phone})

    waiting = await client.get(
        f"/api/admin/products/{piece['id']}/waiting", headers=owner_headers
    )
    assert waiting.json()["waiting"] == 2

    added = await client.post(
        f"/api/admin/products/{piece['id']}/pieces", headers=owner_headers, json={"quantity": 4}
    )
    assert added.status_code == 201

    after = await client.get(
        f"/api/admin/products/{piece['id']}/waiting", headers=owner_headers
    )
    assert after.json()["waiting"] == 0

    rows = list(await db_session.scalars(select(PieceAlert)))
    assert all(row.notified_at is not None for row in rows)


async def test_made_to_order_pieces_have_nothing_to_wait_for(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """They never run out — you can just ask for one."""
    product = await workshop_piece(client, owner_headers)
    refused = await client.post(
        f"/api/products/{product['slug']}/alert", json={"phone": "0655555555"}
    )
    assert refused.status_code == 400
    assert "made to order" in refused.json()["detail"]


async def test_who_is_waiting_is_the_owners_alone(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers, made=1)
    assert (await client.get(f"/api/admin/products/{piece['id']}/waiting")).status_code == 401
