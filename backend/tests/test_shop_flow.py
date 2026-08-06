"""The whole path a real order takes, end to end.

These are the behaviours that cost money if they break: the price collected at
the door, the count of what exists, who is allowed to move an order, and
whether the customer is told.
"""
from __future__ import annotations

from httpx import AsyncClient

PHOTO = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00"
    b"\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


async def publish_piece(
    client: AsyncClient, headers: dict[str, str], *, title: str = "Matte black hook", stock: int = 3
) -> dict:
    """Create a product, photograph it, publish it — the real sequence."""
    created = await client.post(
        "/api/admin/products",
        headers=headers,
        json={
            "title_en": title,
            "title_ar": "خطّاف أسود مطفي",
            "description_en": "Printed and hand-finished in the workshop.",
            "description_ar": "مطبوع ومصقول يدوياً في الورشة.",
            "price": 180,
            "stock": stock,
        },
    )
    assert created.status_code == 201, created.text
    product = created.json()

    photo = await client.post(
        f"/api/admin/products/{product['id']}/media",
        headers=headers,
        files={"file": ("piece.png", PHOTO, "image/png")},
    )
    assert photo.status_code == 201, photo.text

    published = await client.patch(
        f"/api/admin/products/{product['id']}", headers=headers, json={"status": "active"}
    )
    assert published.status_code == 200, published.text
    return published.json()


async def test_a_piece_cannot_be_published_without_a_photograph(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """BRAND.md §8: the photo is the actual piece. No photo, no sale."""
    created = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"title_en": "Unphotographed", "price": 100, "stock": 1},
    )
    assert created.status_code == 201

    refused = await client.patch(
        f"/api/admin/products/{created.json()['id']}",
        headers=owner_headers,
        json={"status": "active"},
    )
    assert refused.status_code == 400
    assert "photo" in refused.json()["detail"].lower()


async def test_the_storefront_only_shows_published_pieces(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"title_en": "Still a draft", "price": 90, "stock": 1},
    )
    listing = await client.get("/api/products")
    assert listing.status_code == 200
    assert listing.json()["total"] == 0

    await publish_piece(client, owner_headers)
    listing = await client.get("/api/products")
    assert listing.json()["total"] == 1


async def test_arabic_is_served_as_arabic(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await publish_piece(client, owner_headers)

    english = await client.get(f"/api/products/{piece['slug']}?lang=en")
    arabic = await client.get(f"/api/products/{piece['slug']}?lang=ar")
    assert english.json()["title"] == "Matte black hook"
    assert arabic.json()["title"] == "خطّاف أسود مطفي"
    assert arabic.json()["description"] == "مطبوع ومصقول يدوياً في الورشة."


async def test_checkout_prices_from_the_database_not_the_request(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The old service multiplied out the price in the request body. A client
    that sends a price of 1 must still owe 180."""
    piece = await publish_piece(client, owner_headers)

    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Salma B.",
            "phone": "0612345678",
            "address": {"line1": "12 Rue des Oliviers", "city": "Casablanca"},
            "items": [{"product_id": piece["id"], "quantity": 2, "price": 1}],
        },
    )
    assert order.status_code == 201, order.text
    body = order.json()
    assert body["subtotal"] == 360.0
    assert body["delivery_fee"] == 30.0
    assert body["total"] == 390.0
    assert body["status"] == "placed"


async def test_delivery_fee_applies_below_the_threshold(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await publish_piece(client, owner_headers, title="Small bracket")
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Youssef A.",
            "phone": "+212612345678",
            "address": {"line1": "4 Avenue Hassan", "city": "Rabat"},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    body = order.json()
    assert body["subtotal"] == 180.0
    assert body["delivery_fee"] == 30.0
    assert body["total"] == 210.0
    # The phone number is normalised to the form the workshop can dial.
    assert body["customer_phone"] == "0612345678"


async def test_you_cannot_buy_more_than_was_made(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """BRAND.md §10: three left because we made three."""
    piece = await publish_piece(client, owner_headers, stock=3)
    refused = await client.post(
        "/api/orders",
        json={
            "full_name": "Nadia K.",
            "phone": "0655555555",
            "address": {"line1": "9 Rue Tarik", "city": "Fès"},
            "items": [{"product_id": piece["id"], "quantity": 4}],
        },
    )
    assert refused.status_code == 409
    assert "3" in refused.json()["detail"]


async def test_stock_falls_when_bought_and_returns_when_cancelled(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await publish_piece(client, owner_headers, stock=3)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Omar T.",
            "phone": "0611111111",
            "address": {"line1": "1 Rue Zerktouni", "city": "Marrakech"},
            "items": [{"product_id": piece["id"], "quantity": 2}],
        },
    )
    reference = order.json()["reference"]

    after_sale = await client.get(f"/api/products/{piece['slug']}")
    assert after_sale.json()["stock"] == 1

    cancelled = await client.post(
        f"/api/admin/orders/{reference}/status",
        headers=owner_headers,
        json={"status": "cancelled"},
    )
    assert cancelled.status_code == 200
    back_on_shelf = await client.get(f"/api/products/{piece['slug']}")
    assert back_on_shelf.json()["stock"] == 3


async def test_the_order_lifecycle_refuses_illegal_moves(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await publish_piece(client, owner_headers)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Imane R.",
            "phone": "0699999999",
            "address": {"line1": "22 Boulevard Anfa", "city": "Casablanca"},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    reference = order.json()["reference"]

    # placed → delivered skips everything in between.
    jump = await client.post(
        f"/api/admin/orders/{reference}/status", headers=owner_headers, json={"status": "delivered"}
    )
    assert jump.status_code == 409

    for step in ("confirmed", "preparing", "ready", "out_for_delivery", "delivered"):
        moved = await client.post(
            f"/api/admin/orders/{reference}/status", headers=owner_headers, json={"status": step}
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["status"] == step

    # Delivered is terminal: a finished order cannot be reopened and re-notified.
    reopened = await client.post(
        f"/api/admin/orders/{reference}/status", headers=owner_headers, json={"status": "placed"}
    )
    assert reopened.status_code == 409


async def test_tracking_needs_only_the_token(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await publish_piece(client, owner_headers)
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
    piece = await publish_piece(client, owner_headers)
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
