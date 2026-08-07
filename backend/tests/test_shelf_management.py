"""Everything the owner does to put a piece in the shop.

`catalog/routes.py` was the least-tested file in the backend — 39% — while
being the one every button on the shelf screen calls. That combination is the
worst kind: the code with the most reach and the least evidence, and the person
who would find out it is broken is a workshop owner at 7am trying to publish
something.

These follow the real sequence, and lean on the guards rather than the happy
path, because the guards are the interesting part: what the shop refuses to do
is most of what keeps the storefront honest.
"""
from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select

from app.models import Piece, PieceState, Product
from tests.test_shop_flow import CASABLANCA, PHOTO, photograph, shelf_piece


async def create_draft(client: AsyncClient, headers: dict[str, str], **overrides) -> dict:
    body = {
        "kind": "shelf",
        "title_en": "Oak shelf",
        "title_ar": "رف بلوط",
        "price": 300,
        **overrides,
    }
    response = await client.post("/api/admin/products", headers=headers, json=body)
    assert response.status_code == 201, response.text
    return response.json()


# ── Photographs ───────────────────────────────────────────────────────────────


async def test_a_piece_cannot_be_published_without_a_photograph(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Not a technical rule — it is the brand. The photo is the actual object
    the customer receives, and a listing without one is the reseller behaviour
    this whole shop exists to be the opposite of."""
    draft = await create_draft(client, owner_headers)
    refused = await client.patch(
        f"/api/admin/products/{draft['id']}", headers=owner_headers, json={"status": "active"}
    )
    assert refused.status_code == 400
    assert "photo" in refused.json()["detail"].lower()


async def test_the_last_photograph_cannot_be_removed_from_a_live_piece(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Otherwise deleting a photo is a way to leave a published piece with
    none, which is the state publishing refuses to create in the first place."""
    piece = await shelf_piece(client, owner_headers)
    photos = (await client.get(f"/api/products/{piece['slug']}")).json()["images"]
    assert len(photos) == 1

    refused = await client.delete(
        f"/api/admin/media/{photos[0]['id']}", headers=owner_headers
    )
    assert refused.status_code == 400


async def test_choosing_a_new_main_photograph_demotes_the_old_one(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Exactly one photo is the one the card, the share card and the search
    result use. Two would be undefined; none would be a blank card."""
    piece = await shelf_piece(client, owner_headers)
    await photograph(client, owner_headers, piece["id"])

    photos = (await client.get(f"/api/products/{piece['slug']}")).json()["images"]
    assert len(photos) == 2
    second = next(photo for photo in photos if not photo["is_primary"])

    promoted = await client.post(
        f"/api/admin/media/{second['id']}/primary", headers=owner_headers
    )
    assert promoted.status_code == 200

    after = (await client.get(f"/api/products/{piece['slug']}")).json()["images"]
    assert [photo["is_primary"] for photo in after].count(True) == 1
    assert next(photo for photo in after if photo["is_primary"])["id"] == second["id"]


async def test_a_file_that_is_not_an_image_is_refused_whatever_it_claims(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    draft = await create_draft(client, owner_headers)
    response = await client.post(
        f"/api/admin/products/{draft['id']}/media",
        headers=owner_headers,
        files={"file": ("piece.png", b"<svg onload=alert(1)></svg>", "image/png")},
    )
    assert response.status_code == 415


# ── The batch ─────────────────────────────────────────────────────────────────


async def test_pieces_are_numbered_within_the_batch_they_belong_to(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """01/04 is a claim about a specific object. Adding more later must not
    silently renumber the ones already sold to somebody."""
    piece = await shelf_piece(client, owner_headers, made=4)
    first = (await client.get(f"/api/admin/products/{piece['id']}/pieces", headers=owner_headers)).json()
    assert [row["label"] for row in first] == ["01/04", "02/04", "03/04", "04/04"]

    added = await client.post(
        f"/api/admin/products/{piece['id']}/pieces", headers=owner_headers, json={"quantity": 2}
    )
    assert added.status_code == 201
    assert [row["number"] for row in added.json()] == [5, 6]


async def test_a_piece_somebody_has_bought_cannot_be_removed(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """It is part of an order. Removing the row would leave a delivered order
    pointing at nothing."""
    piece = await shelf_piece(client, owner_headers, made=2)
    await client.post(
        "/api/orders",
        json={
            "full_name": "Omar T.",
            "phone": "0611111111",
            "address": CASABLANCA,
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    reserved = await db_session.scalar(
        select(Piece).where(Piece.product_id == piece["id"], Piece.state == PieceState.reserved)
    )
    assert reserved is not None

    refused = await client.delete(f"/api/admin/pieces/{reserved.id}", headers=owner_headers)
    assert refused.status_code == 409


async def test_an_unsold_piece_can_be_removed(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    piece = await shelf_piece(client, owner_headers, made=2)
    spare = await db_session.scalar(
        select(Piece).where(Piece.product_id == piece["id"], Piece.state == PieceState.available)
    )
    assert (
        await client.delete(f"/api/admin/pieces/{spare.id}", headers=owner_headers)
    ).status_code == 204
    assert (await client.get(f"/api/products/{piece['slug']}")).json()["available"] == 1


async def test_removing_a_piece_shrinks_the_run_it_was_part_of(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Counted six, made five.

    Adding pieces already rewrites every sibling's batch size — 04/08 becomes
    04/12 when the run grows — and taking one away has to do the same in
    reverse. Left alone, the shop keeps saying "01 of 4" over three objects,
    which is a claim about a specific physical thing that is simply not true.
    """
    product = await shelf_piece(client, owner_headers, made=4)
    last = await db_session.scalar(
        select(Piece)
        .where(Piece.product_id == product["id"], Piece.state == PieceState.available)
        .order_by(Piece.number.desc())
    )

    assert (
        await client.delete(f"/api/admin/pieces/{last.id}", headers=owner_headers)
    ).status_code == 204

    rows = (
        await client.get(f"/api/admin/products/{product['id']}/pieces", headers=owner_headers)
    ).json()
    assert [row["label"] for row in rows] == ["01/03", "02/03", "03/03"]


# ── Taking things down ────────────────────────────────────────────────────────


async def test_a_piece_is_archived_rather_than_deleted(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Order history has to stay reconstructable. A deleted product turns every
    order that contained it into a row nobody can explain."""
    piece = await shelf_piece(client, owner_headers)
    assert (
        await client.delete(f"/api/admin/products/{piece['id']}", headers=owner_headers)
    ).status_code == 204

    # Gone from the shop…
    assert (await client.get(f"/api/products/{piece['slug']}")).status_code == 404
    # …but still in the database.
    still_there = await db_session.scalar(select(Product).where(Product.id == piece["id"]))
    assert still_there is not None
    assert still_there.status.value == "archived"


async def test_taking_a_piece_off_the_shelf_hides_it_without_losing_it(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    await client.patch(
        f"/api/admin/products/{piece['id']}", headers=owner_headers, json={"status": "draft"}
    )
    assert (await client.get(f"/api/products/{piece['slug']}")).status_code == 404
    # The owner still sees it, which is the difference between a draft and a
    # deletion.
    listed = (await client.get("/api/admin/products", headers=owner_headers)).json()
    assert any(row["id"] == piece["id"] for row in listed)


# ── Variants ──────────────────────────────────────────────────────────────────


async def test_two_variants_cannot_share_an_sku(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The SKU is what a piece row points at. Two of them is an inventory
    count that cannot be trusted."""
    piece = await shelf_piece(client, owner_headers)
    body = {"sku": "OAK-L", "option_en": "Large", "option_ar": "كبير"}
    first = await client.post(
        f"/api/admin/products/{piece['id']}/variants", headers=owner_headers, json=body
    )
    assert first.status_code == 201

    clash = await client.post(
        f"/api/admin/products/{piece['id']}/variants", headers=owner_headers, json=body
    )
    assert clash.status_code == 409


async def test_a_retired_variant_disappears_from_the_page_but_not_the_database(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """An order line may point at it — the label on somebody's delivered
    package has to keep meaning something."""
    piece = await shelf_piece(client, owner_headers)
    variant = (
        await client.post(
            f"/api/admin/products/{piece['id']}/variants",
            headers=owner_headers,
            json={"sku": "OAK-S", "option_en": "Small", "option_ar": "صغير"},
        )
    ).json()

    assert (
        await client.delete(f"/api/admin/variants/{variant['id']}", headers=owner_headers)
    ).status_code == 204
    shown = (await client.get(f"/api/products/{piece['slug']}")).json()["variants"]
    assert all(option["id"] != variant["id"] for option in shown)


# ── Categories ────────────────────────────────────────────────────────────────


async def test_a_category_cannot_be_its_own_parent(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    created = (
        await client.post(
            "/api/admin/categories",
            headers=owner_headers,
            json={"name_en": "Shelves", "name_ar": "رفوف"},
        )
    ).json()

    refused = await client.patch(
        f"/api/admin/categories/{created['id']}",
        headers=owner_headers,
        json={"name_en": "Shelves", "name_ar": "رفوف", "parent_id": created["id"]},
    )
    assert refused.status_code == 400


async def test_categories_come_back_as_a_tree(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    parent = (
        await client.post(
            "/api/admin/categories",
            headers=owner_headers,
            json={"name_en": "Furniture", "name_ar": "أثاث"},
        )
    ).json()
    await client.post(
        "/api/admin/categories",
        headers=owner_headers,
        json={"name_en": "Shelves", "name_ar": "رفوف", "parent_id": parent["id"]},
    )

    tree = (await client.get("/api/categories")).json()
    top = next(node for node in tree if node["slug"] == parent["slug"])
    assert [child["name"] for child in top["children"]] == ["Shelves"]


# ── Only the owner ────────────────────────────────────────────────────────────


async def test_none_of_this_is_reachable_without_the_owner(client: AsyncClient) -> None:
    """One check per verb, because they are separate dependencies and a missing
    one on any single route is a stranger editing the shop."""
    assert (await client.get("/api/admin/products")).status_code == 401
    assert (await client.post("/api/admin/products", json={})).status_code == 401
    assert (await client.patch("/api/admin/products/x", json={})).status_code == 401
    assert (await client.delete("/api/admin/products/x")).status_code == 401
    assert (await client.post("/api/admin/categories", json={})).status_code == 401
    assert (
        await client.post("/api/admin/products/x/media", files={"file": ("a.png", PHOTO, "image/png")})
    ).status_code == 401
