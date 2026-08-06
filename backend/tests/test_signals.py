"""What the store records about what people do.

Phase 1 only writes these rows; Phase 2 ranks with them. They are worth
testing now because a signal recorded wrongly today is a feed that is wrong
forever — the history cannot be re-derived after the fact.
"""
from __future__ import annotations

import math

from httpx import AsyncClient
from sqlalchemy import select

from app.models import Signal, SignalType
from app.modules.feed.service import dwell_weight
from tests.test_catalog_shape import make_tree
from tests.test_shop_flow import shelf_piece

VISITOR = {"X-Visitor-Id": "fingerprint-abc123"}


def test_dwell_is_logarithmic_not_linear() -> None:
    """A tab left open for an hour must not outweigh fifty real visits."""
    assert dwell_weight(0) == 0
    assert dwell_weight(None) == 0
    assert dwell_weight(3) == math.log2(4)
    assert dwell_weight(1) < dwell_weight(10) < dwell_weight(60)
    # Capped: past a point, longer means "walked away", not "more interested".
    assert dwell_weight(3600) == dwell_weight(10**6) == 6.0


async def test_signals_are_recorded_in_a_batch(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """A page of 24 cards is one request, not 24 — most buyers are on mobile
    data."""
    piece = await shelf_piece(client, owner_headers)
    response = await client.post(
        "/api/signals",
        headers=VISITOR,
        json={
            "signals": [
                {"type": "impression", "product_id": piece["id"]},
                {"type": "click", "product_id": piece["id"]},
                {"type": "dwell", "product_id": piece["id"], "value": 30},
                {"type": "search", "query": "matte black"},
            ]
        },
    )
    assert response.status_code == 202
    assert response.json()["recorded"] == 4

    rows = list(await db_session.scalars(select(Signal)))
    weights = {row.type: float(row.weight) for row in rows}
    assert weights[SignalType.impression] == 1.0
    assert weights[SignalType.click] == 3.0
    assert weights[SignalType.search] == 4.0
    assert round(weights[SignalType.dwell], 3) == round(math.log2(31), 3)


async def test_a_signal_remembers_the_category_it_happened_in(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Denormalised at write time: a product can be recategorised later, and
    what the visitor was looking at *then* is what the row should keep saying."""
    ids = await make_tree(client, owner_headers)
    piece = await shelf_piece(client, owner_headers)
    await client.patch(
        f"/api/admin/products/{piece['id']}",
        headers=owner_headers,
        json={"category_id": ids["Oversize"]},
    )
    await client.post(
        "/api/signals",
        headers=VISITOR,
        json={"signals": [{"type": "click", "product_id": piece["id"]}]},
    )

    signal = await db_session.scalar(select(Signal))
    assert signal.category_id == ids["Oversize"]

    # Moved to another category — the signal already written does not follow.
    await client.patch(
        f"/api/admin/products/{piece['id']}",
        headers=owner_headers,
        json={"category_id": ids["Slim"]},
    )
    await db_session.refresh(signal)
    assert signal.category_id == ids["Oversize"]


async def test_a_zero_second_dwell_carries_no_information(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    response = await client.post(
        "/api/signals",
        headers=VISITOR,
        json={"signals": [{"type": "dwell", "product_id": piece["id"], "value": 0}]},
    )
    assert response.json()["recorded"] == 0


async def test_a_signed_in_visitor_is_recorded_as_both(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """The fingerprint is the identity that matters — most buyers never sign
    in — but when there is an account too, both are kept, so signing in later
    does not start the history from nothing."""
    piece = await shelf_piece(client, owner_headers)
    await client.post(
        "/api/signals",
        headers={**VISITOR, **owner_headers},
        json={"signals": [{"type": "click", "product_id": piece["id"]}]},
    )
    signal = await db_session.scalar(select(Signal))
    assert signal.visitor_id == "fingerprint-abc123"
    assert signal.user_id is not None


async def test_signals_need_a_visitor_id(client: AsyncClient) -> None:
    response = await client.post("/api/signals", json={"signals": [{"type": "impression"}]})
    assert response.status_code == 400


async def test_a_batch_has_a_ceiling(client: AsyncClient) -> None:
    """Nothing stops a client posting; the endpoint is unauthenticated by
    necessity, so the size is bounded."""
    response = await client.post(
        "/api/signals",
        headers=VISITOR,
        json={"signals": [{"type": "impression"} for _ in range(200)]},
    )
    assert response.status_code == 422
