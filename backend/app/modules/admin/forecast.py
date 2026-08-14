"""How many of each piece we will sell in the next seven days.

**What this is, plainly.** For each piece it takes the orders of the last eight
weeks, weights recent days far more heavily than old ones, and turns that into
a rate per day. Seven times that rate is the forecast. Around it sits an
interval from the Poisson distribution, which is the standard model for "how
many independent things happen in a window" and is the right one here because
sales of a hand-made piece genuinely are rare independent events.

**What this deliberately is not.** It is not a learned model. A neural network
or a gradient-boosted tree trained on a few hundred orders would produce
confident, precise, wrong numbers — it would memorise which week Ramadan fell
in and call it a pattern. At this volume a decayed rate with an honest interval
beats anything more elaborate, and it has the property that matters far more
than accuracy: the owner can be told exactly why it said what it said. When the
shop has years of history and thousands of orders, revisit this. Not before.

**Three sources, in falling order of trust.**

1. *Its own sales.* Used alone once a piece has enough of them.
2. *Its category.* A new lamp is not a mystery — lamps sell at a rate.
3. *Its own attention.* A piece nobody has bought yet still has people opening
   it, and the shop-wide rate of opens turning into orders converts that into
   an expectation. This is what stops every new piece forecasting zero.

The three are blended by how much evidence each has, so a piece moves smoothly
from "we are guessing from the category" to "we know what this one does" as it
accumulates sales, rather than jumping when it crosses a threshold.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Order,
    OrderItem,
    OrderStatus,
    Piece,
    PieceState,
    Product,
    ProductKind,
    ProductStatus,
    Signal,
    SignalType,
)

#: How far back to look. Long enough for a rate to mean something, short
#: enough that last spring is not evidence about this week.
WINDOW_DAYS = 56

#: Interest halves every fortnight. Slower than the feed's seven days on
#: purpose: the feed is chasing what one visitor wants right now, while this is
#: estimating a rate, and a rate that swings on one good Tuesday is not a rate.
HALF_LIFE_DAYS = 14.0

#: The horizon the whole file exists to answer.
HORIZON_DAYS = 7

#: Orders of a piece needed before its own history is trusted on its own.
#: Below this it is blended with the category and with attention.
CONFIDENT_ORDERS = 8

#: What does *not* count as demand.
#:
#: The obvious rule would be to count only delivered orders — a refused package
#: is not a sale, and treating one as demand would have the workshop making
#: pieces for people who send them back. But an order placed this morning has
#: not been delivered either, and those are the most heavily weighted days in
#: the whole window, so counting only delivered would make this week look dead.
#: So everything still in flight counts, and only what actually came back is
#: excluded.
FAILED_STATUSES = (OrderStatus.cancelled, OrderStatus.failed, OrderStatus.returned)


@dataclass(slots=True)
class Line:
    """One delivered or in-flight unit, and how long ago it happened."""

    product_id: str
    category_id: str | None
    days_ago: float
    quantity: int


def _decay(days_ago: float) -> float:
    """A sale from today counts 1.0; one from a fortnight ago counts 0.5."""
    return 0.5 ** (days_ago / HALF_LIFE_DAYS)


def _poisson_interval(expected: float) -> tuple[float, float]:
    """A rough 80% interval for a count with mean `expected`.

    The normal approximation (mean ± 1.28·√mean) is close enough above ~5 and
    too narrow below it, so small expectations get a floor of zero and a widened
    top. The point of showing a range at all is to stop a single number being
    read as a promise.
    """
    if expected <= 0:
        return 0.0, 0.0
    spread = 1.28 * math.sqrt(expected)
    low = max(expected - spread, 0.0)
    high = expected + spread + (1.0 if expected < 5 else 0.0)
    return low, high


async def _recent_lines(db: AsyncSession, since: datetime) -> list[Line]:
    """Every unit sold in the window, with its age in days."""
    rows = (
        await db.execute(
            select(
                OrderItem.product_id,
                Product.category_id,
                Order.created_at,
                OrderItem.quantity,
            )
            .join(Order, Order.id == OrderItem.order_id)
            .join(Product, Product.id == OrderItem.product_id)
            .where(Order.created_at >= since, Order.status.not_in(FAILED_STATUSES))
        )
    ).all()

    now = datetime.now(UTC)
    return [
        Line(
            product_id=str(row.product_id),
            category_id=str(row.category_id) if row.category_id else None,
            days_ago=max((now - row.created_at).total_seconds() / 86400, 0.0),
            quantity=int(row.quantity or 1),
        )
        for row in rows
    ]


async def _attention(db: AsyncSession, since: datetime) -> tuple[dict[str, int], int, int]:
    """People who opened each piece, and the shop-wide open→order rate.

    Returns per-product opens, total opens, total orders — the last two being
    what turns "nine people opened this new piece" into an expectation.
    """
    rows = (
        await db.execute(
            select(
                Signal.product_id,
                func.count(func.distinct(Signal.visitor_id)).label("opens"),
            )
            .where(
                Signal.created_at >= since,
                Signal.type == SignalType.click,
                Signal.product_id.is_not(None),
            )
            .group_by(Signal.product_id)
        )
    ).all()
    opens = {str(row.product_id): int(row.opens) for row in rows}

    bought = await db.scalar(
        select(func.count(func.distinct(Signal.visitor_id))).where(
            Signal.created_at >= since, Signal.type == SignalType.purchase
        )
    )
    return opens, sum(opens.values()), int(bought or 0)


async def next_seven_days(db: AsyncSession) -> dict:
    """The forecast, piece by piece, with what to do about each one."""
    since = datetime.now(UTC) - timedelta(days=WINDOW_DAYS)
    lines = await _recent_lines(db, since)
    opens, total_opens, total_bought = await _attention(db, since)

    # Shop-wide: what fraction of the people who open something end up
    # ordering. Used only for pieces with no sales of their own.
    open_to_order = (total_bought / total_opens) if total_opens else 0.0

    # Decayed units per day, per piece and per category.
    per_product: dict[str, float] = {}
    per_category: dict[str, float] = {}
    orders_of: dict[str, int] = {}
    for line in lines:
        weight = _decay(line.days_ago) * line.quantity
        per_product[line.product_id] = per_product.get(line.product_id, 0.0) + weight
        if line.category_id:
            per_category[line.category_id] = per_category.get(line.category_id, 0.0) + weight
        orders_of[line.product_id] = orders_of.get(line.product_id, 0) + 1

    # The window's effective length: ∫ decay over the window, in days.
    effective_days = HALF_LIFE_DAYS / math.log(2) * (1 - 0.5 ** (WINDOW_DAYS / HALF_LIFE_DAYS))

    products = (
        await db.execute(
            select(
                Product.id,
                Product.slug,
                Product.title_en,
                Product.title_ar,
                Product.kind,
                Product.category_id,
                Product.price,
                Product.lead_time_days,
                func.count(Piece.id)
                .filter(Piece.state == PieceState.available)
                .label("on_the_shelf"),
            )
            .join(Piece, Piece.product_id == Product.id, isouter=True)
            .where(Product.status == ProductStatus.active)
            .group_by(Product.id)
        )
    ).all()

    # How many distinct pieces sit in each category, so a category rate can be
    # shared out rather than promised to every piece in it.
    category_size: dict[str, int] = {}
    for row in products:
        if row.category_id:
            key = str(row.category_id)
            category_size[key] = category_size.get(key, 0) + 1

    items = []
    for row in products:
        product_id = str(row.id)
        category_id = str(row.category_id) if row.category_id else None
        sales = orders_of.get(product_id, 0)

        own_rate = per_product.get(product_id, 0.0) / effective_days
        category_rate = 0.0
        if category_id and category_size.get(category_id):
            category_rate = (
                per_category.get(category_id, 0.0) / effective_days / category_size[category_id]
            )
        attention_rate = opens.get(product_id, 0) * open_to_order / effective_days

        # How much to trust the piece's own history, from 0 to 1. At
        # CONFIDENT_ORDERS it is the only thing used.
        trust = min(sales / CONFIDENT_ORDERS, 1.0)
        fallback = max(category_rate, attention_rate)
        rate = trust * own_rate + (1 - trust) * fallback

        expected = rate * HORIZON_DAYS
        low, high = _poisson_interval(expected)
        on_the_shelf = int(row.on_the_shelf or 0)

        # Made to order never runs out — the constraint is bench time, not
        # stock — so a shortfall is only meaningful for the shelf.
        made_to_order = row.kind is ProductKind.workshop
        shortfall = 0 if made_to_order else max(math.ceil(high) - on_the_shelf, 0)
        days_of_cover = (on_the_shelf / rate) if rate > 0 and not made_to_order else None

        items.append(
            {
                "product_id": product_id,
                "slug": row.slug,
                "title": row.title_en,
                "title_ar": row.title_ar,
                "kind": row.kind.value,
                # Two decimals, not one. At this volume a real expectation is
                # often 0.4 of a unit a week, and rounding that to 0.0 would
                # show the owner a table of zeroes for a shop that is selling.
                # The panel words it — "about one a fortnight" — rather than
                # printing the decimal at them.
                "expected": round(expected, 2),
                "range": [math.floor(low), math.ceil(high)],
                "on_the_shelf": on_the_shelf,
                "days_of_cover": round(days_of_cover, 1) if days_of_cover is not None else None,
                #: What to actually do. Covers the top of the range rather than
                #: the middle, because running out costs a sale and a piece too
                #: many costs a shelf.
                "make": shortfall,
                "revenue_if_met": round(float(row.price) * expected, 0),
                "confidence": _confidence(sales, opens.get(product_id, 0)),
                # Why it says what it says, in the order it was weighed.
                "because": _because(
                    sales=sales,
                    trust=trust,
                    own=own_rate,
                    category=category_rate,
                    attention=attention_rate,
                    opens=opens.get(product_id, 0),
                ),
            }
        )

    items.sort(key=lambda item: item["expected"], reverse=True)
    return {
        "horizon_days": HORIZON_DAYS,
        "generated_on": date.today().isoformat(),
        "based_on_days": WINDOW_DAYS,
        "shop_open_to_order_pct": round(100 * open_to_order, 1),
        "expected_units": round(sum(item["expected"] for item in items), 1),
        "expected_revenue": round(sum(item["revenue_if_met"] for item in items), 0),
        "make_now": [item for item in items if item["make"] > 0],
        "items": items,
    }


def _confidence(sales: int, opens: int) -> str:
    """Said out loud, because a forecast without one invites being read as a
    promise."""
    if sales >= CONFIDENT_ORDERS:
        return "high"
    if sales >= 2 or opens >= 30:
        return "medium"
    return "low"


def _because(
    *, sales: int, trust: float, own: float, category: float, attention: float, opens: int
) -> str:
    if trust >= 1.0:
        return f"{sales} sold recently, weighted towards the last two weeks"
    if sales:
        return (
            f"{sales} sold so far — not enough on its own, so this is mixed with "
            f"how its category is selling"
        )
    if attention > category and opens:
        return f"nothing sold yet; {opens} people opened it and some fraction of opens become orders"
    if category > 0:
        return "nothing sold yet; this is the rate its category sells at"
    return "no sales, no category history and nobody has opened it"
