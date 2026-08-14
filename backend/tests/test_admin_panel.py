"""The control room.

The refusal rate is the figure this file exists for. BRAND.md §6 makes it the
economic centre of the whole business, and a metric computed wrongly is worse
than one not computed at all — the owner would act on it.
"""
from __future__ import annotations

from httpx import AsyncClient

from tests.test_shop_flow import CASABLANCA, shelf_piece

VISITOR = {"X-Visitor-Id": "visitor-alice"}

#: Every step up to the moment somebody knocks on the door.
TO_THE_DOOR = ("confirmed", "preparing", "ready", "out_for_delivery")


async def buy(client: AsyncClient, piece: dict, *, city: str = "Casablanca") -> str:
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Omar T.",
            "phone": "0611111111",
            "address": {"line1": "1 Rue Zerktouni", "city": city},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    assert order.status_code == 201, order.text
    return order.json()["reference"]


async def walk(client: AsyncClient, headers: dict[str, str], reference: str, *steps: str) -> None:
    for step in steps:
        moved = await client.post(
            f"/api/admin/orders/{reference}/status", headers=headers, json={"status": step}
        )
        assert moved.status_code == 200, moved.text


async def test_the_panel_is_the_owners_alone(client: AsyncClient) -> None:
    for path in ("/api/admin/pulse", "/api/admin/decide", "/api/admin/money", "/api/admin/explain"):
        assert (await client.get(path)).status_code == 401


async def test_pulse_shows_today(client: AsyncClient, owner_headers: dict[str, str]) -> None:
    piece = await shelf_piece(client, owner_headers, made=4)
    await buy(client, piece)
    await client.post(
        "/api/signals", headers=VISITOR, json={"signals": [{"type": "click", "product_id": piece["id"]}]}
    )

    pulse = (await client.get("/api/admin/pulse", headers=owner_headers)).json()
    assert pulse["orders_today"] == 1
    assert pulse["open_orders"] == 1
    assert pulse["visitors_today"] == 1
    assert pulse["collected_today_mad"] == 0.0  # nothing delivered yet


async def test_money_collected_counts_only_what_was_delivered(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Cash on delivery: an order is not revenue until someone hands it over
    and takes the money."""
    piece = await shelf_piece(client, owner_headers, made=4)
    delivered = await buy(client, piece)
    await buy(client, piece)  # still in flight

    money = (await client.get("/api/admin/money", headers=owner_headers)).json()
    assert money["revenue"]["collected_mad"] == 0.0

    await walk(client, owner_headers, delivered, *TO_THE_DOOR, "delivered")
    money = (await client.get("/api/admin/money", headers=owner_headers)).json()
    assert money["revenue"]["orders_delivered"] == 1
    assert money["revenue"]["collected_mad"] == 180.0  # delivery is free on everything
    assert money["revenue"]["average_order_mad"] == 180.0


async def test_the_refusal_rate_is_the_number_that_decides_the_business(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers, made=8)
    kept = [await buy(client, piece) for _ in range(3)]
    refused = await buy(client, piece, city="Fès")

    for reference in kept:
        await walk(client, owner_headers, reference, *TO_THE_DOOR, "delivered")
    await walk(client, owner_headers, refused, *TO_THE_DOOR, "failed")

    money = (await client.get("/api/admin/money", headers=owner_headers)).json()
    refusals = money["refusals"]
    assert refusals["delivered_or_attempted"] == 4
    assert refusals["refused"] == 1
    assert refusals["refusal_rate_pct"] == 25.0
    assert refusals["target_pct"] == 8.0
    # And where it is happening, so it can be acted on.
    assert refusals["worst_cities"][0]["city"] == "Fès"


async def test_an_order_nobody_tried_to_deliver_is_not_a_refusal(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Cancelled before it left the workshop costs shipping nothing, so it must
    not pollute the rate the owner steers by."""
    piece = await shelf_piece(client, owner_headers, made=4)
    cancelled = await buy(client, piece)
    delivered = await buy(client, piece)

    await client.post(
        f"/api/admin/orders/{cancelled}/status", headers=owner_headers, json={"status": "cancelled"}
    )
    await walk(client, owner_headers, delivered, *TO_THE_DOOR, "delivered")

    refusals = (await client.get("/api/admin/money", headers=owner_headers)).json()["refusals"]
    assert refusals["delivered_or_attempted"] == 1
    assert refusals["refusal_rate_pct"] == 0.0


async def test_decide_answers_what_should_i_make_next(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The only question a workshop really has, answered from three sources in
    order of how direct they are."""
    piece = await shelf_piece(client, owner_headers, made=1)
    await client.post(
        "/api/requests",
        json={
            "full_name": "Salma B.",
            "phone": "0612345678",
            "description": "A replacement knob for a 1970s radio dial, brass.",
        },
    )
    await client.post(
        "/api/signals",
        headers=VISITOR,
        json={
            "signals": [
                {"type": "search", "query": "brass lamp"},
                {"type": "search", "query": "brass lamp"},
                {"type": "click", "product_id": piece["id"]},
            ]
        },
    )

    decide = (await client.get("/api/admin/decide", headers=owner_headers)).json()
    assert any("radio dial" in text for text in decide["demand"]["people_asked_us_to_make"])
    searched = {row["query"]: row["times"] for row in decide["demand"]["searched_for"]}
    assert searched["brass lamp"] == 2


async def test_best_sellers_rank_by_money_actually_collected(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers, made=4)
    reference = await buy(client, piece)
    await walk(client, owner_headers, reference, *TO_THE_DOOR, "delivered")

    decide = (await client.get("/api/admin/decide", headers=owner_headers)).json()
    assert decide["best_sellers"]["pieces"][0]["sold"] == 1
    assert decide["best_sellers"]["pieces"][0]["revenue_mad"] == 180.0


async def test_conversion_counts_visitors_carts_and_orders(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers, made=4)
    await client.post(
        "/api/signals",
        headers=VISITOR,
        json={"signals": [{"type": "add_to_cart", "product_id": piece["id"]}]},
    )
    await client.post(
        "/api/signals",
        headers={"X-Visitor-Id": "just-looking"},
        json={"signals": [{"type": "impression", "product_id": piece["id"]}]},
    )
    await buy(client, piece)

    conversion = (await client.get("/api/admin/money", headers=owner_headers)).json()["conversion"]
    assert conversion["visitors"] == 2
    assert conversion["put_something_in_a_cart"] == 1
    assert conversion["orders_placed"] == 1
    assert conversion["visitor_to_order_pct"] == 50.0


async def test_every_number_can_explain_itself_in_both_languages(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """A metric nobody understands changes no decision."""
    english = (await client.get("/api/admin/explain", headers=owner_headers)).json()
    # `not_moving` was here too, until the shelf panel it explained was deleted
    # for counting stock this shop does not keep.
    assert {row["name"] for row in english} >= {"refusal_rate", "average_order"}
    assert all(row["explanation"] for row in english)

    arabic = (await client.get("/api/admin/explain?lang=ar", headers=owner_headers)).json()
    assert arabic[0]["explanation"] != english[0]["explanation"]

    one = (
        await client.get("/api/admin/explain?name=refusal_rate", headers=owner_headers)
    ).json()
    assert len(one) == 1
    assert "8" in one[0]["explanation"]


async def test_the_panel_survives_an_empty_shop(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Day one: no orders, no signals, no pieces. Nothing may divide by zero."""
    for path in ("/api/admin/pulse", "/api/admin/decide", "/api/admin/money"):
        response = await client.get(path, headers=owner_headers)
        assert response.status_code == 200, f"{path}: {response.text}"

    money = (await client.get("/api/admin/money", headers=owner_headers)).json()
    assert money["refusals"]["refusal_rate_pct"] == 0.0
    assert money["conversion"]["visitor_to_order_pct"] == 0.0
    assert money["revenue"]["average_order_mad"] == 0.0
    assert CASABLANCA  # the shared fixture is intact


# ── Customers ─────────────────────────────────────────────────────────────────


async def register_and_buy(client: AsyncClient, piece: dict, *, email: str) -> tuple[str, str]:
    """A customer who has an account, buying while signed in. Returns
    (order reference, user id)."""
    registered = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "a-long-enough-password", "full_name": "Salma B."},
    )
    assert registered.status_code == 201, registered.text
    user_id = registered.json()["user"]["id"]
    login = await client.post(
        "/api/auth/login", json={"email": email, "password": "a-long-enough-password"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    order = await client.post(
        "/api/orders",
        headers=headers,
        json={
            "full_name": "Salma B.",
            "phone": "0622222222",
            "address": {"line1": "9 Rue Ibn Sina", "city": "Rabat"},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    assert order.status_code == 201, order.text
    return order.json()["reference"], user_id


async def test_customers_lists_guests_and_registered_accounts_separately(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers, made=4)
    guest_reference = await buy(client, piece)
    await walk(client, owner_headers, guest_reference, *TO_THE_DOOR, "delivered")

    registered_reference, user_id = await register_and_buy(client, piece, email="salma@example.com")
    await walk(client, owner_headers, registered_reference, *TO_THE_DOOR, "delivered")

    customers = (await client.get("/api/admin/customers", headers=owner_headers)).json()
    guest = next(row for row in customers if row["phone"] == "0611111111")
    account = next(row for row in customers if row["phone"] == "0622222222")

    assert guest["has_account"] is False
    assert guest["created_account_at"] is None
    assert guest["is_active"] is None
    assert guest["time_on_site_seconds"] is None  # nothing browsed in this test
    assert guest["revenue_mad"] == 180.0  # delivery is free on everything
    assert guest["products_bought"] == 1

    assert account["has_account"] is True
    assert account["id"] == user_id
    assert account["created_account_at"] is not None
    assert account["is_active"] is True
    assert account["revenue_mad"] == 180.0


async def test_customers_split_bought_from_cancelled(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers, made=4)
    delivered = await buy(client, piece)
    cancelled = await buy(client, piece)
    await walk(client, owner_headers, delivered, *TO_THE_DOOR, "delivered")
    await client.post(
        f"/api/admin/orders/{cancelled}/status", headers=owner_headers, json={"status": "cancelled"}
    )

    customers = (await client.get("/api/admin/customers", headers=owner_headers)).json()
    row = next(row for row in customers if row["phone"] == "0611111111")
    assert row["orders_count"] == 2
    assert row["products_bought"] == 1
    assert row["products_cancelled"] == 1
    assert row["revenue_mad"] == 180.0  # only the delivered one counts; delivery is free


async def test_customers_can_be_searched(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers, made=4)
    await buy(client, piece)

    found = (
        await client.get("/api/admin/customers?q=0611111111", headers=owner_headers)
    ).json()
    assert len(found) == 1
    empty = (await client.get("/api/admin/customers?q=nobody", headers=owner_headers)).json()
    assert empty == []


async def test_owner_can_deactivate_a_customer_account(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers, made=1)
    _, user_id = await register_and_buy(client, piece, email="ban-me@example.com")

    toggled = await client.patch(
        f"/api/admin/customers/{user_id}/active", headers=owner_headers, json={"active": False}
    )
    assert toggled.status_code == 200, toggled.text
    assert toggled.json()["is_active"] is False

    blocked = await client.post(
        "/api/auth/login", json={"email": "ban-me@example.com", "password": "a-long-enough-password"}
    )
    assert blocked.status_code in (401, 403)


async def test_customers_endpoints_are_owner_only(client: AsyncClient) -> None:
    assert (await client.get("/api/admin/customers")).status_code == 401
    assert (
        await client.patch("/api/admin/customers/anything/active", json={"active": False})
    ).status_code == 401


# ── Contact messages ──────────────────────────────────────────────────────────


async def test_contact_message_lands_in_the_admin_inbox(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    sent = await client.post(
        "/api/contact",
        json={"name": "Youssef", "email": "youssef@example.com", "message": "Do you make lamps?"},
    )
    assert sent.status_code == 201, sent.text

    inbox = (await client.get("/api/admin/contact-messages", headers=owner_headers)).json()
    assert len(inbox) == 1
    assert inbox[0]["message"] == "Do you make lamps?"
    assert inbox[0]["read_at"] is None


async def test_contact_message_needs_a_way_back(client: AsyncClient) -> None:
    """Email and phone are each optional, but a message with neither is a
    message the workshop cannot reply to."""
    sent = await client.post("/api/contact", json={"name": "Youssef", "message": "Hello"})
    assert sent.status_code == 422


async def test_owner_can_mark_a_message_read(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    await client.post(
        "/api/contact", json={"name": "Youssef", "phone": "0611111111", "message": "Hello"}
    )
    inbox = (await client.get("/api/admin/contact-messages", headers=owner_headers)).json()
    message_id = inbox[0]["id"]

    marked = await client.post(
        f"/api/admin/contact-messages/{message_id}/read", headers=owner_headers
    )
    assert marked.status_code == 200, marked.text
    assert marked.json()["read_at"] is not None

    # Marking an already-read message again must not fail or move the clock.
    again = await client.post(
        f"/api/admin/contact-messages/{message_id}/read", headers=owner_headers
    )
    assert again.status_code == 200
    assert again.json()["read_at"] == marked.json()["read_at"]


async def test_contact_inbox_is_owner_only(client: AsyncClient) -> None:
    assert (await client.get("/api/admin/contact-messages")).status_code == 401
    assert (await client.post("/api/admin/contact-messages/anything/read")).status_code == 401
