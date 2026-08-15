"""The category tree, variants, and the pieces on the shelf."""
from __future__ import annotations

from httpx import AsyncClient

from tests.test_shop_flow import photograph, shelf_piece


async def make_tree(client: AsyncClient, headers: dict[str, str]) -> dict[str, str]:
    """Clothing → T-Shirts → Oversize, Slim."""
    ids: dict[str, str] = {}
    for name_en, name_ar, parent in (
        ("Clothing", "ملابس", None),
        ("T-Shirts", "تي شيرت", "Clothing"),
        ("Oversize", "واسع", "T-Shirts"),
        ("Slim", "ضيق", "T-Shirts"),
    ):
        response = await client.post(
            "/api/admin/categories",
            headers=headers,
            json={
                "name_en": name_en,
                "name_ar": name_ar,
                "parent_id": ids.get(parent) if parent else None,
            },
        )
        assert response.status_code == 201, response.text
        ids[name_en] = response.json()["id"]
    return ids


async def test_the_tree_nests_and_speaks_both_languages(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    await make_tree(client, owner_headers)

    english = (await client.get("/api/categories?lang=en")).json()
    assert [node["name"] for node in english] == ["Clothing"]
    tshirts = english[0]["children"][0]
    assert tshirts["name"] == "T-Shirts"
    assert sorted(child["name"] for child in tshirts["children"]) == ["Oversize", "Slim"]

    arabic = (await client.get("/api/categories?lang=ar")).json()
    assert arabic[0]["name"] == "ملابس"
    assert arabic[0]["children"][0]["name"] == "تي شيرت"


async def test_a_category_page_includes_everything_beneath_it(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Choosing T-Shirts shows the Oversize ones too — otherwise the parent
    category is an empty room."""
    ids = await make_tree(client, owner_headers)
    piece = await shelf_piece(client, owner_headers, title="Oversize tee")
    await client.patch(
        f"/api/admin/products/{piece['id']}",
        headers=owner_headers,
        json={"category_id": ids["Oversize"]},
    )

    assert (await client.get("/api/products?category=t-shirts")).json()["total"] == 1
    assert (await client.get("/api/products?category=clothing")).json()["total"] == 1
    assert (await client.get("/api/products?category=slim")).json()["total"] == 0


async def test_a_category_cannot_be_its_own_parent(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    ids = await make_tree(client, owner_headers)
    refused = await client.patch(
        f"/api/admin/categories/{ids['T-Shirts']}",
        headers=owner_headers,
        json={"name_en": "T-Shirts", "parent_id": ids["T-Shirts"]},
    )
    assert refused.status_code == 400


async def test_variants_carry_their_own_price(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """A variant either inherits the product's price or overrides it.

    This used to assert per-variant availability as well. The shop stopped
    counting stock, so `available` is null everywhere by design and there is
    nothing left to assert — the price behaviour is the part that still means
    something.
    """
    created = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"kind": "shelf", "title_en": "Oversize tee", "title_ar": "تي شيرت واسع", "price": 200},
    )
    product = created.json()
    await photograph(client, owner_headers, product["id"])

    medium = await client.post(
        f"/api/admin/products/{product['id']}/variants",
        headers=owner_headers,
        json={"sku": "TEE-OS-M", "option_en": "M", "option_ar": "م"},
    )
    large = await client.post(
        f"/api/admin/products/{product['id']}/variants",
        headers=owner_headers,
        json={"sku": "TEE-OS-L", "option_en": "L", "option_ar": "ل", "price": 220},
    )
    assert medium.status_code == 201 and large.status_code == 201

    await client.patch(
        f"/api/admin/products/{product['id']}", headers=owner_headers, json={"status": "active"}
    )
    page = (await client.get(f"/api/products/{product['slug']}")).json()

    by_option = {variant["option"]: variant for variant in page["variants"]}
    assert by_option["M"]["price"] == 200.0  # inherits the product price
    assert by_option["L"]["price"] == 220.0  # its own


async def test_buying_a_variant_records_which_one_was_bought(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The order line remembers the option the buyer chose.

    Formerly `..._takes_a_piece_of_that_variant`: it also asserted that the
    medium was decremented to zero and that a second one was refused with a
    409. Nothing is reserved and no order is ever refused for want of stock,
    so both halves are gone. What the line records is what still matters —
    it is what the workshop reads when packing.
    """
    created = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"kind": "shelf", "title_en": "Oversize tee", "price": 200},
    )
    product = created.json()
    await photograph(client, owner_headers, product["id"])
    medium = (
        await client.post(
            f"/api/admin/products/{product['id']}/variants",
            headers=owner_headers,
            json={"sku": "TEE-M", "option_en": "M"},
        )
    ).json()
    large = (
        await client.post(
            f"/api/admin/products/{product['id']}/variants",
            headers=owner_headers,
            json={"sku": "TEE-L", "option_en": "L"},
        )
    ).json()
    for variant in (medium["id"], large["id"]):
        await client.post(
            f"/api/admin/products/{product['id']}/pieces",
            headers=owner_headers,
            json={"quantity": 1, "variant_id": variant},
        )
    await client.patch(
        f"/api/admin/products/{product['id']}", headers=owner_headers, json={"status": "active"}
    )

    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Salma B.",
            "phone": "0612345678",
            "address": {"line1": "12 Rue des Oliviers", "city": "Casablanca"},
            "items": [{"product_id": product["id"], "variant_id": medium["id"], "quantity": 1}],
        },
    )
    assert order.status_code == 201, order.text
    assert order.json()["items"][0]["variant_id"] == medium["id"]


async def test_a_duplicate_sku_is_refused(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    piece = await shelf_piece(client, owner_headers)
    body = {"sku": "SAME", "option_en": "M"}
    assert (
        await client.post(
            f"/api/admin/products/{piece['id']}/variants", headers=owner_headers, json=body
        )
    ).status_code == 201
    clash = await client.post(
        f"/api/admin/products/{piece['id']}/variants", headers=owner_headers, json=body
    )
    assert clash.status_code == 409


async def test_made_to_order_pieces_have_no_shelf(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    created = await client.post(
        "/api/admin/products",
        headers=owner_headers,
        json={"kind": "workshop", "title_en": "To your drawing", "price": 240, "lead_time_days": 6},
    )
    refused = await client.post(
        f"/api/admin/products/{created.json()['id']}/pieces",
        headers=owner_headers,
        json={"quantity": 3},
    )
    assert refused.status_code == 400
    assert "made per order" in refused.json()["detail"]


async def test_search_reaches_both_languages(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    await shelf_piece(client, owner_headers)
    assert (await client.get("/api/products?q=matte")).json()["total"] == 1
    assert (await client.get("/api/products?q=خطّاف")).json()["total"] == 1
    assert (await client.get("/api/products?q=bicycle")).json()["total"] == 0
