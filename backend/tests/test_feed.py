"""The feed — that the store actually reshapes itself around who is looking.

The unit tests below cover the arrangement rules, which are pure functions and
where the subtle bugs live. The rest go through the real endpoint against the
real query, because the scoring is SQL and a mocked version of it would prove
nothing.
"""
from __future__ import annotations

from httpx import AsyncClient

from app.modules.feed.engine import MAX_PER_CATEGORY, MIN_EXPLORE, Scored, arrange, explore_ratio
from tests.test_catalog_shape import make_tree
from tests.test_shop_flow import photograph

ALICE = {"X-Visitor-Id": "visitor-alice"}
BOB = {"X-Visitor-Id": "visitor-bob"}


async def publish(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    title: str,
    category_id: str | None = None,
    made: int = 5,
) -> dict:
    created = await client.post(
        "/api/admin/products",
        headers=headers,
        json={"kind": "shelf", "title_en": title, "price": 150, "category_id": category_id},
    )
    product = created.json()
    await photograph(client, headers, product["id"])
    await client.post(
        f"/api/admin/products/{product['id']}/pieces", headers=headers, json={"quantity": made}
    )
    published = await client.patch(
        f"/api/admin/products/{product['id']}", headers=headers, json={"status": "active"}
    )
    assert published.status_code == 200, published.text
    return published.json()


# ── The rules, as pure functions ──────────────────────────────────────────────


def test_a_stranger_gets_a_broad_page_and_a_regular_gets_a_narrow_one() -> None:
    assert explore_ratio(0) == 1.0  # we know nothing: show breadth
    assert explore_ratio(10) < 1.0
    assert explore_ratio(100) < explore_ratio(10)
    # But never zero. A feed that only confirms itself stops selling.
    assert explore_ratio(10**9) == MIN_EXPLORE


def test_explore_items_are_spread_through_the_page_not_dumped_at_the_end() -> None:
    """Explore items clumped at the bottom are explore items nobody sees."""
    exploit = [Scored(f"e{i}", "cat-a", 10 - i, explore=False) for i in range(8)]
    explore = [Scored(f"x{i}", "cat-b", 5 - i, explore=True) for i in range(4)]

    laid_out = arrange(exploit + explore, ratio=0.33, size=12, offset=0)
    positions = [index for index, item in enumerate(laid_out) if item.explore]

    assert len(positions) == 4
    assert min(positions) < len(laid_out) // 2  # not all at the bottom
    assert max(positions) - min(positions) > 3  # actually spread


def test_no_page_is_more_than_six_of_one_category() -> None:
    """Monotony reads as a small shop even when the shop is not small."""
    one_category = [Scored(f"p{i}", "cat-a", 100 - i, explore=False) for i in range(40)]
    laid_out = arrange(one_category, ratio=0.0, size=24, offset=0)
    assert len(laid_out) == MAX_PER_CATEGORY


def test_a_second_page_does_not_repeat_the_first() -> None:
    items = [Scored(f"p{i}", f"cat-{i % 8}", 100 - i, explore=False) for i in range(60)]
    first = {item.product_id for item in arrange(items, ratio=0.0, size=12, offset=0)}
    second = {item.product_id for item in arrange(items, ratio=0.0, size=12, offset=12)}
    assert first and second
    assert not (first & second)


def test_a_short_catalogue_still_fills_the_page() -> None:
    """When one track runs dry the other covers it — a half-empty screen reads
    as a broken shop."""
    only_exploit = [Scored(f"p{i}", f"cat-{i % 5}", 10 - i, explore=False) for i in range(20)]
    assert len(arrange(only_exploit, ratio=0.5, size=10, offset=0)) == 10

    only_explore = [Scored(f"p{i}", f"cat-{i % 5}", 10 - i, explore=True) for i in range(20)]
    assert len(arrange(only_explore, ratio=0.15, size=10, offset=0)) == 10


# ── The endpoint, against the real query ──────────────────────────────────────


async def test_the_feed_serves_the_catalogue_to_a_visitor_we_know_nothing_about(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    ids = await make_tree(client, owner_headers)
    for index in range(6):
        await publish(client, owner_headers, title=f"Piece {index}", category_id=ids["Oversize"])

    response = await client.get("/api/feed", headers=ALICE)
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == MAX_PER_CATEGORY
    # Nothing known about this visitor, so the page is entirely discovery.
    assert body["explore_ratio"] == 1.0


async def test_the_feed_works_without_a_fingerprint(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """A first paint or a locked-down browser must still see a shop."""
    await publish(client, owner_headers, title="Something")
    response = await client.get("/api/feed")
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1


async def test_clicking_into_a_category_pulls_that_category_up(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The whole promise: the visitor sees what they want, not what we want."""
    ids = await make_tree(client, owner_headers)
    oversize = [
        await publish(client, owner_headers, title=f"Oversize {i}", category_id=ids["Oversize"])
        for i in range(4)
    ]
    for index in range(4):
        await publish(client, owner_headers, title=f"Slim {index}", category_id=ids["Slim"])

    def positions(items: list[dict], slugs: set[str]) -> list[int]:
        return [index for index, item in enumerate(items) if item["slug"] in slugs]

    oversize_slugs = {piece["slug"] for piece in oversize}
    before = (await client.get("/api/feed", headers=ALICE)).json()["items"]

    # Alice spends her time in Oversize.
    await client.post(
        "/api/signals",
        headers=ALICE,
        json={
            "signals": [
                {"type": signal, "product_id": piece["id"]}
                for piece in oversize
                for signal in ("click", "add_to_cart")
            ]
        },
    )
    after = (await client.get("/api/feed", headers=ALICE)).json()

    assert sum(positions(after["items"], oversize_slugs)) < sum(positions(before, oversize_slugs))
    # And the page has narrowed: we know something about her now.
    assert after["explore_ratio"] < 1.0


async def test_one_visitor_learning_does_not_change_another(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    ids = await make_tree(client, owner_headers)
    pieces = [
        await publish(client, owner_headers, title=f"Piece {i}", category_id=ids["Slim"])
        for i in range(3)
    ]
    await client.post(
        "/api/signals",
        headers=ALICE,
        json={"signals": [{"type": "purchase", "product_id": pieces[0]["id"]}]},
    )
    assert (await client.get("/api/feed", headers=BOB)).json()["explore_ratio"] == 1.0
    assert (await client.get("/api/feed", headers=ALICE)).json()["explore_ratio"] < 1.0


async def test_a_piece_shown_over_and_over_sinks(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Fatigue. Someone who has scrolled past the same thing twenty times has
    decided; showing it again is a wasted slot."""
    ids = await make_tree(client, owner_headers)
    seen = await publish(client, owner_headers, title="Seen a lot", category_id=ids["Slim"])
    for index in range(3):
        await publish(client, owner_headers, title=f"Fresh {index}", category_id=ids["Slim"])

    # Alice engages with the category, so all four are exploit candidates.
    await client.post(
        "/api/signals",
        headers=ALICE,
        json={"signals": [{"type": "click", "product_id": seen["id"]}]},
    )
    before = [item["slug"] for item in (await client.get("/api/feed", headers=ALICE)).json()["items"]]

    await client.post(
        "/api/signals",
        headers=ALICE,
        json={"signals": [{"type": "impression", "product_id": seen["id"]}] * 40},
    )
    after = [item["slug"] for item in (await client.get("/api/feed", headers=ALICE)).json()["items"]]

    assert after.index(seen["slug"]) > before.index(seen["slug"])


async def test_the_feed_never_offers_something_that_is_gone(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """A shelf piece with nothing left must leave the feed. A made-to-order
    piece never leaves it — there is nothing to run out of."""
    sold_out = await publish(client, owner_headers, title="Last one", made=1)
    created = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"kind": "workshop", "title_en": "To order", "price": 300, "lead_time_days": 6},
    )
    await photograph(client, owner_headers, created.json()["id"])
    await client.patch(
        f"/api/admin/products/{created.json()['id']}",
        headers=owner_headers,
        json={"status": "active"},
    )

    slugs = {item["slug"] for item in (await client.get("/api/feed", headers=ALICE)).json()["items"]}
    assert sold_out["slug"] in slugs

    await client.post(
        "/api/orders",
        json={
            "full_name": "Omar T.",
            "phone": "0611111111",
            "address": {"line1": "1 Rue Zerktouni", "city": "Marrakech"},
            "items": [{"product_id": sold_out["id"], "quantity": 1}],
        },
    )
    after = {item["slug"] for item in (await client.get("/api/feed", headers=ALICE)).json()["items"]}
    assert sold_out["slug"] not in after
    assert created.json()["slug"] in after


# ── The owner's levers ────────────────────────────────────────────────────────


async def test_the_weights_are_readable_and_explained(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The panel should make the owner better at running the shop, not just
    show six sliders with cryptic names."""
    english = (await client.get("/api/admin/feed/weights", headers=owner_headers)).json()
    assert {item["key"] for item in english} == {
        "affinity", "semantic", "popular", "fresh", "business", "fatigue"
    }
    assert all(item["explains"] for item in english)

    arabic = (
        await client.get("/api/admin/feed/weights?lang=ar", headers=owner_headers)
    ).json()
    assert arabic[0]["explains"] != english[0]["explains"]


async def test_the_owner_can_push_a_piece_up(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """`business_boost` is the lever the owner asked for: promote what is worth
    making more of."""
    quiet = await publish(client, owner_headers, title="Quiet piece")
    pushed = await publish(client, owner_headers, title="Worth making more of")

    await client.patch(
        f"/api/admin/products/{pushed['id']}",
        headers=owner_headers,
        json={"business_boost": 5},
    )
    order = [item["slug"] for item in (await client.get("/api/feed", headers=BOB)).json()["items"]]
    assert order.index(pushed["slug"]) < order.index(quiet["slug"])


async def test_turning_a_weight_off_hands_the_decision_to_another(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Two pieces, each winning on a different lever: one the owner pushed,
    one everyone else has been looking at. Turning the owner's lever off must
    hand the top slot to the popular one."""
    popular = await publish(client, owner_headers, title="What people look at")
    pushed = await publish(client, owner_headers, title="What the owner pushes")

    await client.patch(
        f"/api/admin/products/{pushed['id']}", headers=owner_headers, json={"business_boost": 5}
    )
    # Someone else's browsing, which is what `popular` measures.
    await client.post(
        "/api/signals",
        headers=ALICE,
        json={"signals": [{"type": "purchase", "product_id": popular["id"]}] * 5},
    )

    with_boost = [
        item["slug"] for item in (await client.get("/api/feed", headers=BOB)).json()["items"]
    ]
    assert with_boost.index(pushed["slug"]) < with_boost.index(popular["slug"])

    updated = await client.put(
        "/api/admin/feed/weights",
        headers=owner_headers,
        json=[{"key": "business", "value": 0}],
    )
    assert updated.status_code == 200
    assert {item["key"]: item["value"] for item in updated.json()}["business"] == 0.0

    without = [item["slug"] for item in (await client.get("/api/feed", headers=BOB)).json()["items"]]
    assert without.index(popular["slug"]) < without.index(pushed["slug"])


async def test_an_unknown_weight_is_refused(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    response = await client.put(
        "/api/admin/feed/weights",
        headers=owner_headers,
        json=[{"key": "vibes", "value": 1}],
    )
    assert response.status_code == 400


async def test_the_levers_are_the_owners_alone(client: AsyncClient) -> None:
    assert (await client.get("/api/admin/feed/weights")).status_code == 401
    assert (
        await client.put("/api/admin/feed/weights", json=[{"key": "fresh", "value": 5}])
    ).status_code == 401


async def test_embedding_refresh_reports_itself_unavailable_without_a_key(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """No API key means every AI feature says so, rather than degrading to a
    guess."""
    await publish(client, owner_headers, title="Something")
    response = await client.post("/api/admin/feed/embeddings", headers=owner_headers)
    assert response.status_code == 200
    assert response.json()["unavailable"] == 1


# ── The half of the ranking that was switched off ─────────────────────────────


async def test_publishing_a_piece_puts_it_into_meaning_space(
    client: AsyncClient, owner_headers: dict[str, str], monkeypatch
) -> None:
    """The feed weights `cosine(visitor_vector, product_embedding)` at 0.8 —
    second only to a visitor's own affinity — and for a long time nothing in
    the application ever wrote a product embedding. The column, the index and
    the SQL term all existed and the term was multiplied by zero for every
    piece in the shop.

    This asserts the caller exists. It does not assert the vector is any good;
    that is the model's job.
    """
    called: list[bool] = []

    async def spy(db, *, force: bool = False) -> dict[str, int]:
        called.append(True)
        return {"embedded": 0, "skipped": 0}

    monkeypatch.setattr("app.modules.catalog.routes.embeddings.refresh", spy)

    created = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"kind": "shelf", "title_en": "A new hook", "title_ar": "خطاف", "price": 90},
    )
    assert created.status_code == 201
    assert called, "creating a piece must schedule an embedding"

    called.clear()
    await client.patch(
        f"/api/admin/products/{created.json()['id']}",
        headers=owner_headers,
        json={"description_en": "Rewritten, which changes what it means."},
    )
    assert called, "rewriting a piece must re-embed it"
