"""The dashboard's numbers.

Every count here is written so it can be checked by hand: three visitors do
known things, and the assertions are the arithmetic anyone would do on paper.
That matters more than usual for analytics, because a funnel that is quietly
wrong still looks completely plausible — and the owner would make real
decisions about what to build from it.
"""
from __future__ import annotations

from httpx import AsyncClient

from tests.test_shop_flow import shelf_piece


async def send(client: AsyncClient, visitor: str, signals: list[dict]) -> None:
    response = await client.post(
        "/api/signals", json={"signals": signals}, headers={"x-visitor-id": visitor}
    )
    assert response.status_code == 202, response.text


async def analytics(client: AsyncClient, headers: dict[str, str]) -> dict:
    response = await client.get("/api/admin/analytics", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


# ── Counting people, not events ───────────────────────────────────────────────


async def test_one_person_looking_five_times_is_one_person(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The whole dashboard is built on distinct visitors. If this is wrong,
    every percentage on the screen is inflated by however much people scroll."""
    piece = await shelf_piece(client, owner_headers)
    await send(
        client,
        "visitor-a",
        [{"type": "impression", "product_id": piece["id"], "path": "/store"}] * 5,
    )

    data = await analytics(client, owner_headers)
    assert data["audience"]["visitors"] == 1
    assert data["funnel"]["steps"][1]["people"] == 1


async def test_the_funnel_narrows_and_names_where_people_go(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Three people see it, two open it, one carts it."""
    piece = await shelf_piece(client, owner_headers)
    product = piece["id"]

    for visitor in ("a", "b", "c"):
        await send(client, visitor, [{"type": "impression", "product_id": product, "path": "/store"}])
    for visitor in ("a", "b"):
        await send(
            client, visitor, [{"type": "click", "product_id": product, "path": "/piece/x"}]
        )
    await send(client, "a", [{"type": "add_to_cart", "product_id": product, "path": "/piece/x"}])

    steps = {step["step"]: step for step in (await analytics(client, owner_headers))["funnel"]["steps"]}
    assert steps["Saw a piece"]["people"] == 3
    assert steps["Opened one"]["people"] == 2
    assert steps["Put it in the cart"]["people"] == 1

    # Two of the three who saw it opened it, and one of those two lost.
    assert steps["Opened one"]["kept_pct"] == 66.7
    assert steps["Opened one"]["lost"] == 1
    assert steps["Put it in the cart"]["of_all_pct"] == 33.3


async def test_a_glance_is_not_a_read(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Under ten seconds is someone who landed and left. Separating the two is
    the only way "opened it" means anything."""
    piece = await shelf_piece(client, owner_headers)
    await send(client, "quick", [{"type": "dwell", "product_id": piece["id"], "value": 3}])
    await send(client, "slow", [{"type": "dwell", "product_id": piece["id"], "value": 40}])

    steps = {step["step"]: step for step in (await analytics(client, owner_headers))["funnel"]["steps"]}
    assert steps["Read it (10s+)"]["people"] == 1


# ── Per piece and per screen ──────────────────────────────────────────────────


async def test_the_product_table_shows_the_whole_funnel_for_one_piece(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    product = piece["id"]
    for visitor in ("a", "b", "c", "d"):
        await send(client, visitor, [{"type": "impression", "product_id": product}])
    await send(client, "a", [{"type": "click", "product_id": product}])
    await send(client, "b", [{"type": "click", "product_id": product}])
    await send(client, "a", [{"type": "purchase", "product_id": product}])

    row = (await analytics(client, owner_headers))["products"]["items"][0]
    assert row["title"] == "Matte black hook"
    assert row["saw"] == 4
    assert row["opened"] == 2
    assert row["opened_pct"] == 50.0
    assert row["bought"] == 1
    # Of the people who opened it — not of everyone who saw it.
    assert row["bought_pct"] == 50.0


async def test_pages_are_grouped_by_pattern_not_by_piece(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Otherwise every piece is its own row and "does the piece page work" is
    a question with two hundred answers."""
    await send(client, "a", [{"type": "click", "path": "/en/piece/matte-black-hook"}])
    await send(client, "b", [{"type": "click", "path": "/ar/piece/oak-shelf"}])

    pages = {row["path"]: row for row in (await analytics(client, owner_headers))["pages"]["items"]}
    assert pages["/piece/[slug]"]["people"] == 2


async def test_a_tracking_token_never_reaches_the_analytics_table(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The panel reads this table. A token in it would be someone's credential
    sitting in a dashboard."""
    await send(client, "a", [{"type": "click", "path": "/en/track/super-secret-token-value"}])
    await send(client, "b", [{"type": "click", "path": "/en/nonsense-route"}])

    paths = [row["path"] for row in (await analytics(client, owner_headers))["pages"]["items"]]
    assert "/track/[token]" in paths
    assert not any("secret" in path for path in paths)
    # An unrecognised route is dropped rather than stored.
    assert not any("nonsense" in path for path in paths)


async def test_how_far_people_scroll_is_a_percentage_of_them(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    for visitor in ("a", "b", "c", "d"):
        await send(client, visitor, [{"type": "impression", "path": "/store"}])
    await send(client, "a", [{"type": "scroll_depth", "value": 70, "path": "/store"}])

    store = next(
        row
        for row in (await analytics(client, owner_headers))["pages"]["items"]
        if row["path"] == "/store"
    )
    assert store["people"] == 4
    assert store["scrolled"] == 1
    assert store["scrolled_pct"] == 25.0


# ── What we do not have ───────────────────────────────────────────────────────


async def test_a_search_that_found_nothing_is_a_thing_to_make(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    await send(client, "a", [{"type": "search", "query": "brass lamp", "value": 0}])
    await send(client, "b", [{"type": "search", "query": "Brass Lamp ", "value": 0}])
    await send(client, "c", [{"type": "search", "query": "hook", "value": 3}])

    unmet = (await analytics(client, owner_headers))["unmet"]["searched_and_found_nothing"]
    assert unmet == [{"query": "brass lamp", "people": 2}]


async def test_the_owner_alone_sees_any_of_this(client: AsyncClient) -> None:
    assert (await client.get("/api/admin/analytics")).status_code == 401
    assert (await client.get("/api/admin/forecast")).status_code == 401
