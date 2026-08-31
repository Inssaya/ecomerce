"""The things a shop needs that this one did not have.

What is left here, now that there is no stock to reserve or run short of (see
`docs/DECISIONS.md`), is getting back to an order without the link.
"""
from __future__ import annotations

from httpx import AsyncClient

from tests.test_shop_flow import CASABLANCA, shelf_piece


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


# ── Getting back to an order without the link ─────────────────────────────────


async def test_an_order_can_be_found_by_reference_and_phone(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """People lose the link. They close the tab, they clear WhatsApp, they
    ordered from a friend's phone."""
    piece = await shelf_piece(client, owner_headers)
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
    piece = await shelf_piece(client, owner_headers)
    order = await buy(client, piece)

    wrong_phone = await client.post(
        "/api/orders/find", json={"reference": order["reference"], "phone": "0699999999"}
    )
    wrong_reference = await client.post(
        "/api/orders/find", json={"reference": "AAAAAAAA", "phone": "0611111111"}
    )
    assert wrong_phone.status_code == wrong_reference.status_code == 404
    assert wrong_phone.json()["detail"] == wrong_reference.json()["detail"]
