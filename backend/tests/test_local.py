"""The pages that bring people in.

Local landing pages are the easiest thing on a site to get wrong in a way that
costs you the whole domain: generate one per service per city, and Google
classifies the lot as doorway pages. So the tests here are mostly about
restraint — that the pages carry facts that differ, and that the ones which
would have to invent a fact say nothing instead.
"""
from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select

from app.config import settings
from app.models import Order, OrderStatus
from app.models.local import City
from app.modules.local.seed import CITIES, SERVICES, seed
from tests.test_shop_flow import CASABLANCA, shelf_piece


async def test_the_shop_knows_where_it_delivers(client: AsyncClient, db_session) -> None:
    await seed(db_session)
    response = await client.get("/api/places")
    assert response.status_code == 200

    places = response.json()["items"]
    assert len(places) == len(CITIES)
    # Biggest first, because that is the order somebody scanning a list wants.
    assert places[0]["name"] == "Casablanca"


async def test_delivery_windows_are_a_range_and_the_south_takes_longer(
    client: AsyncClient, db_session
) -> None:
    """A single number is a promise; a range is the truth. And promising the
    same two days to Dakhla as to Casablanca is how parcels get refused."""
    await seed(db_session)
    places = {row["slug"]: row for row in (await client.get("/api/places")).json()["items"]}

    for place in places.values():
        low, high = place["delivery_days"]
        assert 1 <= low <= high <= 10

    assert places["dakhla"]["delivery_days"][0] > places["casablanca"]["delivery_days"][1]


async def test_a_city_page_carries_what_can_be_made_there(
    client: AsyncClient, db_session
) -> None:
    """Someone who searched for a city has to be told what they can get, or
    the page answers half a question."""
    await seed(db_session)
    page = (await client.get("/api/places/marrakesh")).json()

    assert page["name"] == "Marrakesh"
    assert page["delivery_fee"] > 0
    assert {item["slug"] for item in page["services"]} == {row["slug"] for row in SERVICES}


async def test_a_city_we_do_not_serve_is_a_404_not_an_empty_page(
    client: AsyncClient, db_session
) -> None:
    """An auto-generated page for every place name is exactly the doorway
    pattern that gets a domain demoted."""
    await seed(db_session)
    assert (await client.get("/api/places/paris")).status_code == 404
    assert (await client.get("/api/services/car-repair")).status_code == 404


async def test_a_new_shop_does_not_claim_a_delivery_history(
    client: AsyncClient, db_session
) -> None:
    """Nothing has been delivered anywhere yet, so the page must not say a
    number — "0 pieces delivered here" is worse than not raising it."""
    await seed(db_session)
    history = (await client.get("/api/places/casablanca")).json()["history"]
    assert history["delivered"] == 0
    assert history["worth_saying"] is False
    assert history["average_days"] is None


async def test_once_it_is_true_the_page_may_say_it(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Three deliveries to one city is a fact worth printing. Fewer is an
    anecdote, and printing it tells the reader how small the shop is."""
    await seed(db_session)
    piece = await shelf_piece(client, owner_headers, made=6)

    for _ in range(3):
        placed = await client.post(
            "/api/orders",
            json={
                "full_name": "Omar T.",
                "phone": "0611111111",
                "address": CASABLANCA,
                "items": [{"product_id": piece["id"], "quantity": 1}],
            },
        )
        reference = placed.json()["reference"]
        for step in ("confirmed", "preparing", "ready", "out_for_delivery", "delivered"):
            moved = await client.post(
                f"/api/admin/orders/{reference}/status",
                headers=owner_headers,
                json={"status": step},
            )
            assert moved.status_code == 200, moved.text

    history = (await client.get("/api/places/casablanca")).json()["history"]
    assert history["delivered"] == 3
    assert history["worth_saying"] is True


async def test_the_city_typed_at_checkout_matches_however_it_was_typed(
    client: AsyncClient, db_session
) -> None:
    """Checkout takes free text on purpose — a dropdown missing someone's town
    loses the order — so the match has to forgive case and spacing."""
    await seed(db_session)
    place = await db_session.scalar(select(City).where(City.slug == "casablanca"))
    assert place is not None

    from app.modules.local.service import delivered_to

    db_session.add(
        Order(
            reference="CASETEST",
            tracking_token="t" * 40,
            customer_name="Test",
            customer_phone="0611111111",
            city="  cASABLANCA ",
            address={"line1": "x", "city": "casablanca"},
            subtotal=100,
            delivery_fee=30,
            total=130,
            status=OrderStatus.delivered,
        )
    )
    await db_session.commit()

    assert (await delivered_to(db_session, "Casablanca"))["delivered"] == 1


async def test_every_service_says_something_worth_reading(
    client: AsyncClient, db_session
) -> None:
    """A page that only restates its own title ranks for nothing. This is the
    floor, not the target."""
    await seed(db_session)
    for entry in (await client.get("/api/services")).json()["items"]:
        page = (await client.get(f"/api/services/{entry['slug']}")).json()
        assert len(page["body"]) > 400
        assert page["summary"]
        assert page["places"], "a service page has to say where it reaches"


async def test_there_is_no_french_anywhere_in_the_content(
    client: AsyncClient, db_session
) -> None:
    """A hard constraint of this shop, and city names are where it always
    leaks in: Fès, Tanger, Salé, Marrakech."""
    await seed(db_session)
    names = " ".join(row["name_en"] for row in (await client.get("/api/places")).json()["items"])
    for french in ("Fès", "Tanger", "Salé", "Marrakech", "Tétouan", "Casa "):
        assert french not in names


# ── One fee, wherever it is read ──────────────────────────────────────────────


async def test_an_order_is_charged_the_fee_that_citys_page_publishes(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """The City model carries a delivery fee "where a city genuinely costs more
    to reach", and the city page has always printed it. The till used to ignore
    it and charge the flat setting instead — so the page said one number and the
    courier asked for another, which is exactly how a package comes back.
    """
    await seed(db_session)
    place = await db_session.scalar(select(City).where(City.slug == "dakhla"))
    place.delivery_fee = 75
    await db_session.commit()

    published = (await client.get("/api/places/dakhla")).json()["delivery_fee"]
    assert published == 75

    piece = await shelf_piece(client, owner_headers, price=120)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Aya B.",
            "phone": "0611111111",
            "address": {"line1": "3 Rue du Port", "city": place.name_en},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    assert order.status_code == 201, order.text
    assert order.json()["delivery_fee"] == published
    assert order.json()["total"] == 120 + published


async def test_a_town_we_have_not_named_pays_the_shops_own_fee(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Checkout takes the city as free text on purpose. Somewhere we have made
    no promise about is not refused — it is simply charged the ordinary fee."""
    await seed(db_session)
    piece = await shelf_piece(client, owner_headers, price=120)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Aya B.",
            "phone": "0611111111",
            "address": {"line1": "somewhere", "city": "Ait Ourir"},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    assert order.status_code == 201, order.text
    assert order.json()["delivery_fee"] == settings.delivery_fee


async def test_the_city_is_matched_however_it_was_typed(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """A person types it, so "casablanca", "Casablanca" and " CASABLANCA " are
    one place — and the Arabic name is the real one, not a transliteration."""
    await seed(db_session)
    place = await db_session.scalar(select(City).where(City.slug == "casablanca"))
    place.delivery_fee = 20
    await db_session.commit()

    from app.modules.local.service import fee_for_name

    for typed in ("casablanca", "  CASABLANCA ", "Casablanca", place.name_ar):
        assert await fee_for_name(db_session, typed) == 20, typed

    assert await fee_for_name(db_session, "nowhere") == settings.delivery_fee
    assert await fee_for_name(db_session, None) == settings.delivery_fee


async def test_free_delivery_still_beats_a_citys_own_fee(
    client: AsyncClient, owner_headers: dict[str, str], db_session
) -> None:
    """Over the threshold nothing is charged, expensive city or not. The
    threshold is the promise the shop makes; the fee is a detail below it."""
    await seed(db_session)
    place = await db_session.scalar(select(City).where(City.slug == "dakhla"))
    place.delivery_fee = 75
    await db_session.commit()

    piece = await shelf_piece(client, owner_headers, price=settings.free_delivery_over + 10)
    order = await client.post(
        "/api/orders",
        json={
            "full_name": "Aya B.",
            "phone": "0611111111",
            "address": {"line1": "3 Rue du Port", "city": "Dakhla"},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    assert order.json()["delivery_fee"] == 0


async def test_the_places_list_states_the_shops_own_terms(client: AsyncClient, db_session) -> None:
    """So the cart and the checkout can print the cost without inventing it."""
    await seed(db_session)
    body = (await client.get("/api/places")).json()
    assert body["default"]["delivery_fee"] == settings.delivery_fee
    assert body["default"]["free_delivery_over"] == settings.free_delivery_over
