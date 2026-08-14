"""Custom requests — request, quote, approve, make, deliver.

The behaviour worth protecting: nothing is owed until a price has been quoted
and agreed. A made-to-order piece whose price nobody agreed on is exactly the
surprise at the door that cash on delivery punishes.
"""
from __future__ import annotations

from httpx import AsyncClient

ADDRESS = {"line1": "12 Rue des Oliviers", "city": "Casablanca"}

ASKING = {
    "full_name": "Salma B.",
    "phone": "0612345678",
    "email": "salma@example.ma",
    "city": "Casablanca",
    "description": "A bracket to hold a shelf on a curved wall, matte black, about 20cm.",
}


async def ask(client: AsyncClient, **overrides) -> dict:
    response = await client.post("/api/requests", json={**ASKING, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


async def test_anyone_can_ask_without_an_account_or_a_price(client: AsyncClient) -> None:
    request = await ask(client)
    assert request["status"] == "requested"
    assert request["quote_price"] is None
    assert request["customer_phone"] == "0612345678"
    assert [event["status"] for event in request["events"]] == ["requested"]


async def test_a_request_needs_enough_words_to_act_on(client: AsyncClient) -> None:
    response = await client.post("/api/requests", json={**ASKING, "description": "a thing"})
    assert response.status_code == 422


async def test_a_bad_phone_number_is_refused(client: AsyncClient) -> None:
    response = await client.post("/api/requests", json={**ASKING, "phone": "123"})
    assert response.status_code == 422


async def test_the_customer_follows_it_with_the_token_alone(client: AsyncClient) -> None:
    request = await ask(client)
    tracked = await client.get(f"/api/requests/track/{request['tracking_token']}")
    assert tracked.status_code == 200
    assert tracked.json()["reference"] == request["reference"]
    assert (await client.get("/api/requests/track/nope")).status_code == 404


async def test_a_quote_carries_a_price_and_a_real_date(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """"Ready in six days", never "soon"."""
    request = await ask(client)
    quoted = await client.post(
        f"/api/admin/requests/{request['reference']}/quote",
        headers=owner_headers,
        json={"price": 260, "lead_time_days": 6, "note_en": "Printed then hand-finished."},
    )
    assert quoted.status_code == 200, quoted.text
    body = quoted.json()
    assert body["status"] == "quoted"
    assert body["quote_price"] == 260.0
    assert body["lead_time_days"] == 6
    assert body["promised_for"] is not None  # an actual date, computed


async def test_a_quote_without_a_date_is_refused(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    request = await ask(client)
    response = await client.post(
        f"/api/admin/requests/{request['reference']}/quote",
        headers=owner_headers,
        json={"price": 260},
    )
    assert response.status_code == 422


async def test_nothing_is_owed_until_the_customer_approves(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """A quote is not an order. This is the whole rule."""
    from sqlalchemy import func, select

    from app.models import Order

    request = await ask(client)
    await client.post(
        f"/api/admin/requests/{request['reference']}/quote",
        headers=owner_headers,
        json={"price": 260, "lead_time_days": 6},
    )
    assert await db_session.scalar(select(func.count()).select_from(Order)) == 0

    approved = await client.post(
        f"/api/requests/track/{request['tracking_token']}/approve",
        json={"address": ADDRESS},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert approved.json()["order_reference"] == request["reference"]
    assert await db_session.scalar(select(func.count()).select_from(Order)) == 1


async def test_the_order_raised_on_approval_charges_the_quoted_price(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The money, and the thing the money is for.

    The second half of this test is the part that matters. Every assertion
    here used to be about totals, and the order was being written with **no
    line items at all** — `approve()` built one only `if request.product_id`,
    which a custom request never has. Totals were right, the order was empty,
    and every test in this file passed.

    The rule that follows: an order test asserts on what was sold, not only on
    what it came to.
    """
    request = await ask(client)
    await client.post(
        f"/api/admin/requests/{request['reference']}/quote",
        headers=owner_headers,
        json={"price": 260, "lead_time_days": 6},
    )
    await client.post(
        f"/api/requests/track/{request['tracking_token']}/approve", json={"address": ADDRESS}
    )

    order = await client.get(
        f"/api/admin/orders/{request['reference']}", headers=owner_headers
    )
    assert order.status_code == 200, order.text
    body = order.json()
    assert body["subtotal"] == 260.0
    assert body["delivery_fee"] == 0.0
    assert body["total"] == 260.0

    # One line, carrying what they asked for at the price that was agreed.
    assert len(body["items"]) == 1, "an approved request must produce a sellable line"
    line = body["items"][0]
    assert line["unit_price"] == 260.0
    assert line["quantity"] == 1
    assert line["subtotal"] == 260.0
    # Described, not catalogued — there is no product behind a custom line.
    assert line["product_id"] is None
    assert line["title"].startswith("A bracket to hold a shelf")


async def test_approving_something_never_quoted_is_refused(client: AsyncClient) -> None:
    request = await ask(client)
    response = await client.post(
        f"/api/requests/track/{request['tracking_token']}/approve", json={"address": ADDRESS}
    )
    assert response.status_code == 409


async def test_the_price_cannot_move_after_the_handshake(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Re-quoting is fine while it is still a quote. Once they have said yes to
    a number, that number is the number."""
    request = await ask(client)
    quote_url = f"/api/admin/requests/{request['reference']}/quote"
    assert (
        await client.post(quote_url, headers=owner_headers, json={"price": 260, "lead_time_days": 6})
    ).status_code == 200
    # Still just a quote: the customer asked for a change, the number moves.
    assert (
        await client.post(quote_url, headers=owner_headers, json={"price": 240, "lead_time_days": 8})
    ).status_code == 200

    await client.post(
        f"/api/requests/track/{request['tracking_token']}/approve", json={"address": ADDRESS}
    )
    after = await client.post(
        quote_url, headers=owner_headers, json={"price": 900, "lead_time_days": 2}
    )
    assert after.status_code == 409


async def test_the_full_lifecycle_and_its_illegal_shortcuts(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    request = await ask(client)
    reference = request["reference"]
    status_url = f"/api/admin/requests/{reference}/status"

    # requested → in_production skips the quote and the agreement.
    assert (
        await client.post(status_url, headers=owner_headers, json={"status": "in_production"})
    ).status_code == 409

    await client.post(
        f"/api/admin/requests/{reference}/quote",
        headers=owner_headers,
        json={"price": 260, "lead_time_days": 6},
    )
    await client.post(
        f"/api/requests/track/{request['tracking_token']}/approve", json={"address": ADDRESS}
    )
    for step in ("in_production", "ready", "delivered"):
        moved = await client.post(status_url, headers=owner_headers, json={"status": step})
        assert moved.status_code == 200, moved.text
        assert moved.json()["status"] == step

    # Delivered is terminal.
    assert (
        await client.post(status_url, headers=owner_headers, json={"status": "ready"})
    ).status_code == 409


async def test_we_can_say_we_cannot_make_it(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Better to decline than to make something we are not proud of."""
    request = await ask(client)
    declined = await client.post(
        f"/api/admin/requests/{request['reference']}/status",
        headers=owner_headers,
        json={"status": "declined", "note": "Not something we can do properly at this size."},
    )
    assert declined.status_code == 200
    assert declined.json()["status"] == "declined"


async def test_the_customer_can_walk_away_from_a_quote(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """A refused quote is not a refused package — it costs nobody anything."""
    request = await ask(client)
    await client.post(
        f"/api/admin/requests/{request['reference']}/quote",
        headers=owner_headers,
        json={"price": 900, "lead_time_days": 6},
    )
    withdrawn = await client.post(f"/api/requests/track/{request['tracking_token']}/withdraw")
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn"


async def test_requests_are_the_owners_alone_to_read(client: AsyncClient) -> None:
    await ask(client)
    assert (await client.get("/api/admin/requests")).status_code == 401


async def test_the_owner_sees_them_newest_first(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Read together, these say what the workshop should make next."""
    await ask(client, description="A curved shelf bracket, matte black, 20cm.")
    await ask(client, description="A replacement knob for a 1970s radio dial.")

    listing = await client.get("/api/admin/requests", headers=owner_headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 2
    assert "radio dial" in listing.json()[0]["description"]

    only_open = await client.get("/api/admin/requests?status=requested", headers=owner_headers)
    assert len(only_open.json()) == 2


async def test_arabic_requests_get_arabic_quote_notes(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    request = await ask(client, lang="ar")
    await client.post(
        f"/api/admin/requests/{request['reference']}/quote",
        headers=owner_headers,
        json={
            "price": 260,
            "lead_time_days": 6,
            "note_en": "Printed then hand-finished.",
            "note_ar": "مطبوع ثم مصقول يدوياً.",
        },
    )
    arabic = await client.get(f"/api/requests/track/{request['tracking_token']}?lang=ar")
    assert arabic.json()["quote_note"] == "مطبوع ثم مصقول يدوياً."
    english = await client.get(f"/api/requests/track/{request['tracking_token']}?lang=en")
    assert english.json()["quote_note"] == "Printed then hand-finished."
