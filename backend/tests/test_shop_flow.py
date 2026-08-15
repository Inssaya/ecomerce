"""The whole path a real order takes, end to end.

These are the behaviours that cost money if they break: the price collected at
the door, whether what the page says exists actually exists, who is allowed to
move an order, and whether the customer is told.
"""
from __future__ import annotations

from httpx import AsyncClient

PHOTO = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00"
    b"\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

CASABLANCA = {"line1": "12 Rue des Oliviers", "city": "Casablanca"}


async def photograph(client: AsyncClient, headers: dict[str, str], product_id: str) -> None:
    response = await client.post(
        f"/api/admin/products/{product_id}/media",
        headers=headers,
        files={"file": ("piece.png", PHOTO, "image/png")},
    )
    assert response.status_code == 201, response.text


async def shelf_piece(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    title: str = "Matte black hook",
    made: int = 3,
    numbered: bool = False,
    price: float = 180,
) -> dict:
    """Create it, photograph it, make some, publish it — the real sequence."""
    created = await client.post(
        "/api/admin/products",
        headers=headers,
        json={
            "kind": "shelf",
            "title_en": title,
            "title_ar": "خطّاف أسود مطفي",
            "description_en": "Printed and hand-finished in the workshop.",
            "description_ar": "مطبوع ومصقول يدوياً في الورشة.",
            "story_en": "Printed overnight, then filed and oiled by hand.",
            "story_ar": "طُبع ليلاً، ثم بُرد وزُيّت يدوياً.",
            "price": price,
            "show_piece_numbers": numbered,
        },
    )
    assert created.status_code == 201, created.text
    product = created.json()

    await photograph(client, headers, product["id"])
    pieces = await client.post(
        f"/api/admin/products/{product['id']}/pieces", headers=headers, json={"quantity": made}
    )
    assert pieces.status_code == 201, pieces.text

    published = await client.patch(
        f"/api/admin/products/{product['id']}", headers=headers, json={"status": "active"}
    )
    assert published.status_code == 200, published.text
    return published.json()


async def workshop_piece(
    client: AsyncClient, headers: dict[str, str], *, lead_time: int = 6
) -> dict:
    created = await client.post(
        "/api/admin/products",
        headers=headers,
        json={
            "kind": "workshop",
            "title_en": "Made to your drawing",
            "title_ar": "نصنعه حسب رسمك",
            "price": 240,
            "lead_time_days": lead_time,
        },
    )
    assert created.status_code == 201, created.text
    product = created.json()
    await photograph(client, headers, product["id"])
    published = await client.patch(
        f"/api/admin/products/{product['id']}", headers=headers, json={"status": "active"}
    )
    assert published.status_code == 200, published.text
    return published.json()


# ── What may be published ─────────────────────────────────────────────────────


async def test_a_piece_cannot_be_published_without_a_photograph(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """BRAND.md §8: the photo is the actual piece. No photo, no sale."""
    created = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"kind": "shelf", "title_en": "Unphotographed", "price": 100},
    )
    refused = await client.patch(
        f"/api/admin/products/{created.json()['id']}",
        headers=owner_headers,
        json={"status": "active"},
    )
    assert refused.status_code == 400
    assert "photo" in refused.json()["detail"].lower()


async def test_a_made_to_order_piece_needs_a_real_lead_time(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """"Ready in six days", never "soon"."""
    refused = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"kind": "workshop", "title_en": "Vague", "price": 100},
    )
    assert refused.status_code == 422
    assert "lead time" in refused.text


# ── What the storefront shows ─────────────────────────────────────────────────


async def test_the_storefront_only_shows_published_pieces(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"kind": "shelf", "title_en": "Still a draft", "price": 90},
    )
    assert (await client.get("/api/products")).json()["total"] == 0

    await shelf_piece(client, owner_headers)
    assert (await client.get("/api/products")).json()["total"] == 1


async def test_the_two_offers_read_differently(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The two offers still read differently by kind and by lead time. Neither
    reports availability any more — the shop does not count units."""
    shelf = await shelf_piece(client, owner_headers, made=3)
    workshop = await workshop_piece(client, owner_headers, lead_time=6)

    on_shelf = (await client.get(f"/api/products/{shelf['slug']}")).json()
    assert on_shelf["kind"] == "shelf"
    assert on_shelf["lead_time_days"] is None

    made_to_order = (await client.get(f"/api/products/{workshop['slug']}")).json()
    assert made_to_order["kind"] == "workshop"
    # Not zero — zero would read as sold out, and it means the opposite.
    assert made_to_order["available"] is None
    assert made_to_order["lead_time_days"] == 6


async def test_arabic_is_served_as_arabic(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    english = (await client.get(f"/api/products/{piece['slug']}?lang=en")).json()
    arabic = (await client.get(f"/api/products/{piece['slug']}?lang=ar")).json()

    assert english["title"] == "Matte black hook"
    assert arabic["title"] == "خطّاف أسود مطفي"
    assert arabic["description"] == "مطبوع ومصقول يدوياً في الورشة."
    assert arabic["story"] == "طُبع ليلاً، ثم بُرد وزُيّت يدوياً."


# ── Buying ────────────────────────────────────────────────────────────────────


async def test_checkout_prices_from_the_database_not_the_request(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The old service multiplied out the price in the request body. A client
    that sends a price of 1 must still owe 180."""
    piece = await shelf_piece(client, owner_headers)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Salma B.",
            "phone": "0612345678",
            "address": CASABLANCA,
            "items": [{"product_id": piece["id"], "quantity": 2, "price": 1}],
        },
    )
    assert order.status_code == 201, order.text
    body = order.json()
    assert body["subtotal"] == 360.0
    assert body["delivery_fee"] == 0.0
    assert body["total"] == 360.0


async def test_a_made_to_order_line_records_what_was_promised(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    product = await workshop_piece(client, owner_headers, lead_time=6)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Imane R.",
            "phone": "0699999999",
            "address": CASABLANCA,
            "items": [{"product_id": product["id"], "quantity": 2}],
        },
    )
    item = order.json()["items"][0]
    assert item["lead_time_days"] == 6
    assert item["piece_id"] is None
    assert item["quantity"] == 2


# ── The order's life ──────────────────────────────────────────────────────────


async def test_the_order_lifecycle_refuses_illegal_moves(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Imane R.",
            "phone": "0699999999",
            "address": CASABLANCA,
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    reference = order.json()["reference"]

    jump = await client.post(
        f"/api/admin/orders/{reference}/status", headers=owner_headers, json={"status": "delivered"}
    )
    assert jump.status_code == 409

    for step in ("confirmed", "preparing", "ready", "out_for_delivery", "delivered"):
        assert (
            await client.post(
                f"/api/admin/orders/{reference}/status",
                headers=owner_headers,
                json={"status": step},
            )
        ).status_code == 200

    # Delivered is terminal: a finished order cannot be reopened and re-notified.
    reopened = await client.post(
        f"/api/admin/orders/{reference}/status", headers=owner_headers, json={"status": "placed"}
    )
    assert reopened.status_code == 409


async def test_tracking_needs_only_the_token(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Hamza L.",
            "phone": "0644444444",
            "address": {"line1": "5 Rue Ibn Sina", "city": "Tanger"},
            "lang": "ar",
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    token = order.json()["tracking_token"]
    tracked = await client.get(f"/api/orders/track/{token}")

    assert tracked.status_code == 200
    assert tracked.json()["reference"] == order.json()["reference"]
    assert [event["status"] for event in tracked.json()["events"]] == ["placed"]
    assert (await client.get("/api/orders/track/not-a-real-token")).status_code == 404


async def test_a_bad_phone_number_is_refused_before_the_order_exists(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    refused = await client.post(
        "/api/orders",
        json={
            "full_name": "Wrong Number",
            "phone": "12345",
            "address": {"line1": "7 Rue Moulay", "city": "Agadir"},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    assert refused.status_code == 422


async def test_the_phone_number_is_normalised_to_something_dialable(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Youssef A.",
            "phone": "+212 612 345 678",
            "address": {"line1": "4 Avenue Hassan", "city": "Rabat"},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    assert order.json()["customer_phone"] == "0612345678"


