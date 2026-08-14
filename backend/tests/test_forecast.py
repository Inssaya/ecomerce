"""What we expect to sell next week.

A forecast is the one thing on the panel that can be confidently wrong without
looking wrong, and the owner will spend real money and real bench hours on it.
So these tests check the properties that make it trustworthy rather than exact
numbers: that recent sales count for more than old ones, that a refused package
is not a sale, that a piece nobody has bought does not silently forecast zero,
and that the range always contains the number.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.models import Order, OrderStatus
from tests.test_shop_flow import CASABLANCA, shelf_piece


async def forecast(client: AsyncClient, headers: dict[str, str]) -> dict:
    response = await client.get("/api/admin/forecast", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def row_for(data: dict, title: str) -> dict:
    return next(item for item in data["items"] if item["title"] == title)


async def buy(client: AsyncClient, piece: dict, *, quantity: int = 1) -> dict:
    response = await client.post(
        "/api/orders",
        json={
            "full_name": "Omar T.",
            "phone": "0611111111",
            "address": CASABLANCA,
            "items": [{"product_id": piece["id"], "quantity": quantity}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def age_order(db_session, reference: str, days: int) -> Order:
    order = await db_session.scalar(select(Order).where(Order.reference == reference))
    order.created_at = datetime.now(UTC) - timedelta(days=days)
    await db_session.commit()
    return order


# ── The shape of the answer ───────────────────────────────────────────────────


async def test_the_range_always_contains_the_number(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """A forecast shown without a range gets read as a promise."""
    piece = await shelf_piece(client, owner_headers, made=6)
    await buy(client, piece)

    row = row_for(await forecast(client, owner_headers), piece["title_en"])
    low, high = row["range"]
    assert low <= row["expected"] <= high
    assert row["confidence"] in {"low", "medium", "high"}
    assert row["because"]


async def test_every_row_says_why(client: AsyncClient, owner_headers: dict[str, str]) -> None:
    """A number the owner cannot interrogate is one they will either
    over-trust or ignore, and both are worse than no number."""
    await shelf_piece(client, owner_headers, made=2)
    for item in (await forecast(client, owner_headers))["items"]:
        assert item["because"]
        assert item["confidence"]


# ── What counts as evidence ───────────────────────────────────────────────────


async def test_a_sale_this_week_counts_for_more_than_one_two_months_ago(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Otherwise the forecast describes the spring rather than next week."""
    recent = await shelf_piece(client, owner_headers, title="Recent hook", made=8)
    old = await shelf_piece(client, owner_headers, title="Old hook", made=8)

    # The same three sales each — the only difference is when they happened.
    for _ in range(3):
        await buy(client, recent)
    for _ in range(3):
        stale = await buy(client, old)
        await age_order(db_session, stale["reference"], days=50)

    data = await forecast(client, owner_headers)
    assert row_for(data, "Recent hook")["expected"] > row_for(data, "Old hook")["expected"]


async def test_a_refused_package_is_not_a_sale(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Counting one would have the workshop making pieces for people who send
    them back — the single most expensive mistake in a cash-on-delivery shop."""
    kept = await shelf_piece(client, owner_headers, title="Kept hook", made=8)
    sent_back = await shelf_piece(client, owner_headers, title="Refused hook", made=8)

    # Three each. One shop keeps them, the other gets all three back.
    for _ in range(3):
        await buy(client, kept)
    for _ in range(3):
        refused = await buy(client, sent_back)
        order = await db_session.scalar(
            select(Order).where(Order.reference == refused["reference"])
        )
        order.status = OrderStatus.returned
        await db_session.commit()

    data = await forecast(client, owner_headers)
    assert row_for(data, "Refused hook")["expected"] < row_for(data, "Kept hook")["expected"]


async def test_a_piece_nobody_has_bought_yet_is_not_forecast_at_zero(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """A new piece with no sales but real attention would otherwise forecast
    zero forever, and never be made again — the failure mode that quietly kills
    every new thing the workshop tries."""
    selling = await shelf_piece(client, owner_headers, title="Known hook", made=8)
    fresh = await shelf_piece(client, owner_headers, title="New hook", made=1)

    # An established piece, so the shop has an open-to-order rate at all.
    await buy(client, selling)
    await client.post(
        "/api/signals",
        json={"signals": [{"type": "purchase", "product_id": selling["id"]}]},
        headers={"x-visitor-id": "buyer"},
    )
    for visitor in range(12):
        await client.post(
            "/api/signals",
            json={"signals": [{"type": "click", "product_id": selling["id"]}]},
            headers={"x-visitor-id": f"looker-{visitor}"},
        )
    # And a crowd looking at the new one.
    for visitor in range(12):
        await client.post(
            "/api/signals",
            json={"signals": [{"type": "click", "product_id": fresh["id"]}]},
            headers={"x-visitor-id": f"new-looker-{visitor}"},
        )

    row = row_for(await forecast(client, owner_headers), "New hook")
    assert row["expected"] > 0
    assert "opened" in row["because"]
    assert row["confidence"] != "high"


# ── What to do about it ───────────────────────────────────────────────────────


async def test_it_says_how_many_to_make_when_the_shelf_will_not_cover_it(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The recommendation covers the top of the range, not the middle: running
    out costs a sale, one piece too many costs a shelf."""
    piece = await shelf_piece(client, owner_headers, title="Fast hook", made=8)
    for _ in range(5):
        await buy(client, piece)

    data = await forecast(client, owner_headers)
    row = row_for(data, "Fast hook")
    assert row["on_the_shelf"] == 3
    assert row["make"] == max(row["range"][1] - 3, 0)
    if row["make"]:
        assert any(item["title"] == "Fast hook" for item in data["make_now"])


async def test_made_to_order_is_never_short(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """It cannot run out — there is nothing to run out of. The constraint is
    bench time, and telling the owner to "make 3 more" of something made after
    it is ordered is noise."""
    from tests.test_shop_flow import workshop_piece

    product = await workshop_piece(client, owner_headers)
    row = row_for(await forecast(client, owner_headers), product["title_en"])
    assert row["kind"] == "workshop"
    assert row["make"] == 0
    assert row["days_of_cover"] is None
