"""Development-only sample history.

The console's whole first face is about what happened — orders, refusals,
people waiting, where visitors stop. With an empty database every one of
those screens is an empty state, which makes the design impossible to judge
and, worse, makes a working console look broken.

This writes a plausible few weeks of shop history so the screens have
something true-shaped to draw.

    python -m app.seed_demo          # add history
    python -m app.seed_demo --clear  # remove everything it made

**It refuses to run when ENVIRONMENT=production.** Nothing here should ever
touch a real shop's database — a fake order is indistinguishable from a real
one once it is in the orders table, and it would pollute every number the
owner makes decisions from.

Everything it creates is marked: orders take the `DEMO-` reference prefix and
contact messages carry a known marker, so `--clear` can find them all again.
"""
from __future__ import annotations

import asyncio
import random
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select

from app.config import settings
from app.db import SessionLocal
from app.models import (
    ContactMessage,
    Order,
    PieceAlert,
    OrderEvent,
    OrderItem,
    OrderStatus,
    Piece,
    PieceState,
    Product,
    Signal,
    SignalType,
)
from app.models.requests import CustomRequest, RequestEvent, RequestStatus

DEMO_PREFIX = "DEMO-"
DEMO_MARKER = "[sample]"
#: Piece alerts have no free-text field to mark, so the address carries it.
DEMO_EMAIL_DOMAIN = "@sample.invalid"

CITIES = ["Casablanca", "Rabat", "Fès", "Marrakech", "Tanger", "Agadir", "Oujda", "Meknès"]
NAMES = [
    "Amina Benali", "Youssef El Amrani", "Sara Idrissi", "Omar Chakir", "Khadija Naciri",
    "Mehdi Tazi", "Salma Bennis", "Hamza Alaoui", "Nadia Fassi", "Rachid Berrada",
    "Imane Sqalli", "Karim Lahlou",
]
ASKS = [
    "A wooden key holder engraved with our family name, something like the ones you have but bigger",
    "Can you make a lamp like the vortex one but in white? For a bedroom",
    "I need 20 mugs printed with a company logo for an office, is that possible?",
    "A phone stand in the shape of a cat, my daughter would love it",
    "Something for a wedding — 50 small wooden pieces with names engraved",
    "Do you do t-shirts with a photo printed on them? I have a picture of my dog",
]
SEARCHES_FOUND_NOTHING = ["wooden clock", "keychain", "wall art", "resin table", "phone case", "desk lamp"]
MESSAGES = [
    "Do you deliver to Dakhla? I did not see it in the list.",
    "Hello, how long does a custom order usually take?",
    "Is the ninja pen holder still available in black?",
    "Can I pay by bank transfer instead of cash on delivery?",
]


def fail(message: str) -> None:
    print(message)
    raise SystemExit(1)


async def clear() -> None:
    async with SessionLocal() as db:
        orders = list(await db.scalars(select(Order).where(Order.reference.startswith(DEMO_PREFIX))))
        for order in orders:
            await db.execute(delete(OrderEvent).where(OrderEvent.order_id == order.id))
            await db.execute(delete(OrderItem).where(OrderItem.order_id == order.id))
            await db.delete(order)

        requests = list(await db.scalars(select(CustomRequest).where(CustomRequest.reference.startswith(DEMO_PREFIX))))
        for request in requests:
            await db.execute(delete(RequestEvent).where(RequestEvent.request_id == request.id))
            await db.delete(request)

        await db.execute(delete(ContactMessage).where(ContactMessage.message.contains(DEMO_MARKER)))
        await db.execute(delete(Signal).where(Signal.visitor_id.startswith("demo-")))
        await db.execute(delete(PieceAlert).where(PieceAlert.email.endswith(DEMO_EMAIL_DOMAIN)))

        # Put any piece this script sold back on the shelf.
        for piece in await db.scalars(select(Piece).where(Piece.state == PieceState.sold)):
            piece.state = PieceState.available

        await db.commit()
        print(f"Removed {len(orders)} orders, {len(requests)} requests and their signals.")


async def seed() -> None:
    random.seed(7)
    now = datetime.now(UTC)

    async with SessionLocal() as db:
        products = list(await db.scalars(select(Product).where(Product.status == "active")))
        if not products:
            fail("No active products. Publish something first — there is nothing to sell.")

        existing = await db.scalar(
            select(func.count()).select_from(Order).where(Order.reference.startswith(DEMO_PREFIX))
        )
        if existing:
            fail(f"{existing} sample orders already exist. Run with --clear first.")

        # ── Browsing history ──────────────────────────────────────────────
        # Counted per visitor, not per event, so the funnel percentages can be
        # read as sentences. Each visitor drops out somewhere plausible.
        #
        # Visitor ids are drawn from a fixed population rather than minted per
        # day. The previous generator built them as `demo-{day}-{i}`, which put
        # the day *inside* the identity — so no visitor could ever appear twice
        # and `returning_pct` was pinned at 0 no matter how much history it
        # produced. A dashboard metric that the seed cannot exercise looks
        # broken rather than empty.
        POPULATION = 220
        RETURNING_SHARE = 0.35

        # A minority who come back repeatedly, and a long tail who visit once —
        # which is roughly how a small shop's traffic actually looks.
        regulars = [f"demo-v{index}" for index in range(int(POPULATION * RETURNING_SHARE))]
        one_timers = iter(f"demo-x{index}" for index in range(10_000))

        # `audience()` calls someone "returning" when they were seen *before
        # the window starts* — deliberately, so that a March buyer who comes
        # back today counts as returning rather than as new. History therefore
        # has to outrun the longest period the Board offers (90 days), or that
        # view reports 0% however many visitors exist. Twice the longest
        # window leaves every preset with real "before" to measure against.
        HISTORY_DAYS = 180

        signals: list[Signal] = []
        for day in range(HISTORY_DAYS):
            when = now - timedelta(days=HISTORY_DAYS - 1 - day)
            for _ in range(random.randint(6, 20)):
                visitor = random.choice(regulars) if random.random() < 0.45 else next(one_timers)
                seen = random.sample(products, k=min(len(products), random.randint(2, 6)))
                for product in seen:
                    signals.append(
                        Signal(
                            visitor_id=visitor,
                            type=SignalType.impression,
                            product_id=product.id,
                            category_id=product.category_id,
                            weight=1,
                            path="/[lang]",
                            created_at=when,
                        )
                    )
                if random.random() < 0.45:
                    opened = random.choice(seen)
                    signals.append(
                        Signal(
                            visitor_id=visitor, type=SignalType.click, product_id=opened.id,
                            category_id=opened.category_id, weight=3, path="/[lang]/piece/[slug]", created_at=when,
                        )
                    )
                    if random.random() < 0.5:
                        signals.append(
                            Signal(
                                visitor_id=visitor, type=SignalType.dwell, product_id=opened.id,
                                category_id=opened.category_id, weight=4, value=random.randint(10, 90),
                                path="/[lang]/piece/[slug]", created_at=when,
                            )
                        )
                    if random.random() < 0.22:
                        signals.append(
                            Signal(
                                visitor_id=visitor, type=SignalType.add_to_cart, product_id=opened.id,
                                category_id=opened.category_id, weight=8, path="/[lang]/cart", created_at=when,
                            )
                        )
                        # Some of those carts become orders. Without this the
                        # funnel's last step is always zero, which reads as a
                        # broken chart rather than a shop that sells nothing.
                        if random.random() < 0.35:
                            signals.append(
                                Signal(
                                    visitor_id=visitor, type=SignalType.purchase, product_id=opened.id,
                                    category_id=opened.category_id, weight=10, path="/[lang]/checkout",
                                    created_at=when,
                                )
                            )
                if random.random() < 0.12:
                    query = random.choice(SEARCHES_FOUND_NOTHING)
                    signals.append(
                        Signal(
                            visitor_id=visitor, type=SignalType.search, query=query, weight=4,
                            value=0,  # found nothing — the sharpest unmet-demand signal
                            path="/[lang]/search", created_at=when,
                        )
                    )
        db.add_all(signals)

        # ── Orders ────────────────────────────────────────────────────────
        # A refusal rate a little over target, so the Board has something
        # real to be worried about rather than a flat green screen.
        statuses = (
            [OrderStatus.delivered] * 22
            + [OrderStatus.failed] * 3
            + [OrderStatus.returned] * 1
            + [OrderStatus.placed] * 4
            + [OrderStatus.confirmed] * 2
            + [OrderStatus.preparing] * 2
            + [OrderStatus.out_for_delivery] * 2
        )
        random.shuffle(statuses)

        for index, status in enumerate(statuses):
            placed = now - timedelta(days=random.randint(0, 29), hours=random.randint(0, 20))
            name = random.choice(NAMES)
            city = random.choice(CITIES)
            chosen = random.sample(products, k=random.randint(1, 3))
            items = [
                OrderItem(
                    product_id=product.id,
                    title=product.title_en,
                    variant_label="",
                    piece_label="",
                    quantity=1,
                    unit_price=product.price,
                    subtotal=product.price,
                    image_url=None,
                )
                for product in chosen
            ]
            subtotal = sum(float(item.subtotal) for item in items)
            order = Order(
                reference=f"{DEMO_PREFIX}{1000 + index}",
                tracking_token=f"demo-token-{index}-{random.randint(1000, 9999)}",
                customer_name=name,
                customer_phone=f"06{random.randint(10000000, 99999999)}",
                customer_email=None,
                city=city,
                address={"line1": f"{random.randint(1, 180)} Rue Example", "city": city, "notes": random.choice(["", "", "Third floor, blue door", "Call before arriving"])},
                subtotal=subtotal,
                delivery_fee=0,
                total=subtotal,
                status=status,
                created_at=placed,
                updated_at=placed + timedelta(days=random.randint(1, 4)),
                items=items,
            )
            order.events = [
                OrderEvent(status=OrderStatus.placed, actor="customer", created_at=placed),
                *(
                    [OrderEvent(status=status, actor="workshop", created_at=placed + timedelta(days=2))]
                    if status is not OrderStatus.placed
                    else []
                ),
            ]
            db.add(order)

        # ── Commissions ───────────────────────────────────────────────────
        for index, ask in enumerate(ASKS):
            asked = now - timedelta(days=random.randint(0, 12))
            status = [RequestStatus.requested, RequestStatus.requested, RequestStatus.quoted,
                      RequestStatus.approved, RequestStatus.in_production, RequestStatus.requested][index]
            request = CustomRequest(
                reference=f"{DEMO_PREFIX}R{200 + index}",
                tracking_token=f"demo-req-{index}-{random.randint(1000, 9999)}",
                customer_name=random.choice(NAMES),
                customer_phone=f"06{random.randint(10000000, 99999999)}",
                customer_email=None,
                city=random.choice(CITIES),
                description=ask,
                budget=random.choice([None, 300, 500, 800, 1200]),
                references=[],
                status=status,
                created_at=asked,
            )
            if status in (RequestStatus.quoted, RequestStatus.approved, RequestStatus.in_production):
                request.quote_price = random.choice([350, 600, 900])
                request.lead_time_days = random.choice([5, 7, 10])
            request.events = [RequestEvent(status=RequestStatus.requested, actor="customer", created_at=asked)]
            db.add(request)

        # ── People waiting on a sold-out piece ────────────────────────────
        # The sharpest demand signal in the building — somebody who would have
        # paid, for a specific piece, at a price they had already seen — and
        # the seed created none of it, so "Waiting on a piece" was a permanent
        # empty state and its age could never be read on screen.
        # Nothing in the seed ever sold out, so nobody could be waiting and the
        # shelf never reached zero. Clear a few runs first — the waiting list
        # is then a consequence of the shelf, which is what it is in real life.
        # `--clear` already returns every sold piece to the shelf.
        shelf = [product for product in products if product.kind == "shelf"]
        sold_out = random.sample(shelf, k=min(6, len(shelf)))
        for product in sold_out:
            for piece in await db.scalars(
                select(Piece).where(Piece.product_id == product.id, Piece.state == PieceState.available)
            ):
                piece.state = PieceState.sold

        for product in sold_out:
            # Spread over weeks, because how long someone has waited is the
            # difference between "make it soon" and "you have lost this sale".
            for index in range(random.randint(1, 7)):
                db.add(
                    PieceAlert(
                        product_id=product.id,
                        phone=f"06{random.randint(10000000, 99999999)}",
                        # Carries the marker so `--clear` can find these again;
                        # everything this script writes has to be removable.
                        email=f"waiting{index}{DEMO_EMAIL_DOMAIN}",
                        lang="en",
                        created_at=now - timedelta(days=random.randint(0, 40), hours=index),
                    )
                )

        # ── Messages ──────────────────────────────────────────────────────
        for index, text in enumerate(MESSAGES):
            db.add(
                ContactMessage(
                    name=random.choice(NAMES),
                    email=f"someone{index}@example.ma",
                    phone=f"06{random.randint(10000000, 99999999)}",
                    message=f"{text} {DEMO_MARKER}",
                    created_at=now - timedelta(days=random.randint(0, 9)),
                    read_at=None if index < 3 else now,
                )
            )

        await db.commit()
        print(
            f"Added {len(statuses)} orders, {len(ASKS)} commissions, {len(MESSAGES)} messages "
            f"and {len(signals)} browsing signals."
        )


def main() -> int:
    # The one guard that matters. A fake order in a real orders table is
    # indistinguishable from a real one and poisons every number after it.
    if settings.environment == "production":
        fail("Refusing to run: ENVIRONMENT is production. This is development-only data.")

    if "--clear" in sys.argv:
        asyncio.run(clear())
    else:
        asyncio.run(seed())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
