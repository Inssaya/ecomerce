"""What actually happened on the site.

`metrics.py` answers business questions — money, refusals, what to make.
This file answers a different one: *what do people do here*, screen by screen
and piece by piece, from the signals the store has been collecting all along.

Two decisions shape everything below.

**Everything counts people, not events.** "412 impressions" is a number you can
inflate by scrolling up and down; "38 people saw it" is not. Every figure here
is a `COUNT(DISTINCT visitor_id)`, which is why the funnel percentages can be
read as sentences — *of the people who opened it, a third put it in a cart* —
and why they never exceed 100%.

**One statement per table.** A funnel of six steps is one query with six
filtered aggregates, not six queries. Postgres reads the signal rows for the
period once and counts them six ways; the alternative reads the same rows six
times and starts to hurt exactly when the shop starts working.
"""
from __future__ import annotations

from sqlalchemy import Float, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Product, Signal, SignalType
from app.models.requests import CustomRequest
from app.modules.admin.metrics import WHOLE_SHOP, Period, Scope, _scoped, _within

#: Below this, someone landed and left. Above it, they read something.
#:
#: Ten seconds is not a guess dressed up as a threshold — it is roughly how
#: long the piece page takes to read down to the story, and the whole point of
#: separating "opened" from "stayed" is to tell a mis-click apart from
#: interest. It is stated here rather than buried in a query so it can be
#: argued with.
STAYED_SECONDS = 10

#: How far down a list counts as having actually looked through it.
SCROLLED_PERCENT = 50


def _people(*conditions) -> object:
    """Distinct visitors matching a condition, as a filtered aggregate.

    The same shape appears a dozen times below; writing it out each time is
    how the funnel and the per-product table quietly drift apart.
    """
    return func.count(func.distinct(Signal.visitor_id)).filter(*conditions)


def _pct(part: int, whole: int) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


# ── Who is here ───────────────────────────────────────────────────────────────


async def audience(db: AsyncSession, period: Period, scope: Scope = WHOLE_SHOP) -> dict:
    """Unique visitors, how many came back, and the shape of the days.

    "Returning" is measured against all of history rather than the previous
    period: someone who bought in March and came back today is a returning
    visitor, and calling them new because March was outside the window would
    make the number a description of the window instead of the shop.
    """
    seen_before = (
        select(Signal.visitor_id)
        .where(Signal.created_at < period.start)
        .group_by(Signal.visitor_id)
        .subquery()
    )

    row = (
        await db.execute(
            _scoped(
                select(
                    func.count(func.distinct(Signal.visitor_id)).label("visitors"),
                    func.count(func.distinct(Signal.visitor_id))
                    .filter(Signal.visitor_id.in_(select(seen_before.c.visitor_id)))
                    .label("returning"),
                    func.count().label("actions"),
                ).where(_within(Signal.created_at, period)),
                scope,
            )
        )
    ).one()

    daily = (
        await db.execute(
            _scoped(
                select(
                    func.date(Signal.created_at).label("day"),
                    func.count(func.distinct(Signal.visitor_id)).label("visitors"),
                ).where(_within(Signal.created_at, period)),
                scope,
            )
            .group_by(func.date(Signal.created_at))
            .order_by(func.date(Signal.created_at))
        )
    ).all()

    visitors = row.visitors or 0
    return {
        "period": period.as_dict(),
        "visitors": visitors,
        "returning": row.returning or 0,
        "returning_pct": _pct(row.returning or 0, visitors),
        "actions": row.actions or 0,
        "actions_per_visitor": round((row.actions or 0) / visitors, 1) if visitors else 0.0,
        # Every day in the period, including the empty ones — a chart with the
        # quiet days missing is a chart that lies about the shape of a week.
        "daily": _fill_days(period, {str(day): count for day, count in daily}),
    }


def _fill_days(period: Period, counts: dict[str, int]) -> list[dict]:
    from datetime import timedelta

    days = []
    cursor = period.start
    while cursor <= period.end:
        key = cursor.isoformat()
        days.append({"date": key, "visitors": counts.get(key, 0)})
        cursor += timedelta(days=1)
    return days


# ── The funnel ────────────────────────────────────────────────────────────────


async def funnel(db: AsyncSession, period: Period, scope: Scope = WHOLE_SHOP) -> dict:
    """Where people stop.

    Each step is the people who reached it, so the drop between two rows is
    the number of people the shop lost there. The largest drop is the most
    valuable sentence on the whole dashboard.

    Scoped to a piece, the first step changes meaning: "came to the shop"
    becomes "touched this piece at all", because a visitor who never saw it
    generated no signal carrying its id. That is the honest reading and the
    screen labels it.
    """
    row = (
        await db.execute(
            _scoped(
                select(
                    _people().label("visited"),
                    _people(Signal.type == SignalType.impression).label("saw_a_piece"),
                    _people(Signal.type == SignalType.click).label("opened_one"),
                    _people(
                        Signal.type == SignalType.dwell, Signal.value >= STAYED_SECONDS
                    ).label("stayed"),
                    _people(Signal.type == SignalType.add_to_cart).label("added_to_cart"),
                    _people(Signal.type == SignalType.purchase).label("ordered"),
                ).where(_within(Signal.created_at, period)),
                scope,
            )
        )
    ).one()

    steps = [
        ("Came to the shop", "زاروا المتجر", row.visited or 0),
        ("Saw a piece", "رأوا قطعة", row.saw_a_piece or 0),
        ("Opened one", "فتحوا واحدة", row.opened_one or 0),
        (f"Read it ({STAYED_SECONDS}s+)", f"قرأوها ({STAYED_SECONDS} ثانية فأكثر)", row.stayed or 0),
        ("Put it in the cart", "أضافوها إلى السلة", row.added_to_cart or 0),
        ("Ordered", "طلبوا", row.ordered or 0),
    ]

    top = steps[0][2]
    out = []
    for index, (label_en, label_ar, people) in enumerate(steps):
        previous = steps[index - 1][2] if index else people
        out.append(
            {
                "step": label_en,
                "step_ar": label_ar,
                "people": people,
                "of_all_pct": _pct(people, top),
                # What share of the previous step got this far. This is the
                # number that names the leak.
                "kept_pct": _pct(people, previous),
                "lost": max(previous - people, 0) if index else 0,
            }
        )
    return {"period": period.as_dict(), "steps": out}


# ── Piece by piece ────────────────────────────────────────────────────────────


async def by_product(db: AsyncSession, period: Period, limit: int = 60) -> dict:
    """The same funnel, per piece.

    This is the table that answers *which of these is actually working*. A
    piece that everybody opens and nobody carts has a price or a photo problem;
    one that nobody opens has a thumbnail problem; one that carts and does not
    sell has a delivery problem. The columns are arranged so those three read
    differently at a glance.
    """
    rows = (
        await db.execute(
            select(
                Signal.product_id,
                _people(Signal.type == SignalType.impression).label("saw"),
                _people(Signal.type == SignalType.click).label("opened"),
                _people(
                    Signal.type == SignalType.dwell, Signal.value >= STAYED_SECONDS
                ).label("stayed"),
                func.avg(
                    case((Signal.type == SignalType.dwell, cast(Signal.value, Float)))
                ).label("avg_seconds"),
                _people(Signal.type == SignalType.add_to_cart).label("added"),
                _people(Signal.type == SignalType.purchase).label("bought"),
            )
            .where(_within(Signal.created_at, period), Signal.product_id.is_not(None))
            .group_by(Signal.product_id)
            .order_by(func.count(func.distinct(Signal.visitor_id)).desc())
            .limit(limit)
        )
    ).all()

    ids = [str(row.product_id) for row in rows]
    titles = (
        dict(
            (
                await db.execute(
                    select(Product.id, Product.title_en).where(Product.id.in_(ids))
                )
            ).all()
        )
        if ids
        else {}
    )

    items = []
    for row in rows:
        product_id = str(row.product_id)
        saw, opened, bought = row.saw or 0, row.opened or 0, row.bought or 0
        items.append(
            {
                "product_id": product_id,
                "title": titles.get(product_id, "—"),
                "saw": saw,
                "opened": opened,
                "opened_pct": _pct(opened, saw),
                "stayed": row.stayed or 0,
                "avg_seconds": round(float(row.avg_seconds), 1) if row.avg_seconds else 0.0,
                "added": row.added or 0,
                "bought": bought,
                # Of the people who opened it. Against impressions this number
                # would mostly measure how often the feed showed the piece.
                "bought_pct": _pct(bought, opened),
            }
        )
    return {"period": period.as_dict(), "items": items}


async def for_product(db: AsyncSession, product_id: str, period: Period) -> dict:
    """The same funnel again, for one piece, with its shape over time.

    `by_product` answers "which of these is working" across the shop; this
    answers "how is *this* one doing", which is the question the console asks
    when the owner clicks Analytics on a row. Same aggregates deliberately —
    a number that means one thing in the table and another in the popup is
    worse than no number.
    """
    row = (
        await db.execute(
            select(
                _people(Signal.type == SignalType.impression).label("saw"),
                _people(Signal.type == SignalType.click).label("opened"),
                _people(
                    Signal.type == SignalType.dwell, Signal.value >= STAYED_SECONDS
                ).label("stayed"),
                func.avg(
                    case((Signal.type == SignalType.dwell, cast(Signal.value, Float)))
                ).label("avg_seconds"),
                _people(Signal.type == SignalType.add_to_cart).label("added"),
                _people(Signal.type == SignalType.purchase).label("bought"),
            ).where(_within(Signal.created_at, period), Signal.product_id == product_id)
        )
    ).one()

    daily = (
        await db.execute(
            select(
                func.date(Signal.created_at).label("day"),
                func.count(func.distinct(Signal.visitor_id)).label("visitors"),
            )
            .where(_within(Signal.created_at, period), Signal.product_id == product_id)
            .group_by(func.date(Signal.created_at))
            .order_by(func.date(Signal.created_at))
        )
    ).all()

    saw, opened, bought = row.saw or 0, row.opened or 0, row.bought or 0
    return {
        "period": period.as_dict(),
        "saw": saw,
        "opened": opened,
        "opened_pct": _pct(opened, saw),
        "stayed": row.stayed or 0,
        "avg_seconds": round(float(row.avg_seconds), 1) if row.avg_seconds else 0.0,
        "added": row.added or 0,
        "bought": bought,
        "bought_pct": _pct(bought, opened),
        # Through `_fill_days`, so a day nobody came is a zero in the line
        # rather than a gap the eye reads as missing data.
        "daily": _fill_days(period, {str(day): count for day, count in daily}),
    }


# ── Screen by screen ──────────────────────────────────────────────────────────


async def by_page(db: AsyncSession, period: Period) -> dict:
    """What happens on each screen.

    `path` is a route pattern, so `/piece/[slug]` is one row covering every
    piece — which is the row you want, because the question is whether *the
    piece page* works, not whether one hook does.
    """
    rows = (
        await db.execute(
            select(
                Signal.path,
                _people().label("people"),
                _people(
                    Signal.type == SignalType.scroll_depth, Signal.value >= SCROLLED_PERCENT
                ).label("scrolled"),
                func.avg(
                    case((Signal.type == SignalType.dwell, cast(Signal.value, Float)))
                ).label("avg_seconds"),
                _people(Signal.type == SignalType.add_to_cart).label("acted"),
            )
            .where(_within(Signal.created_at, period), Signal.path.is_not(None))
            .group_by(Signal.path)
            .order_by(func.count(func.distinct(Signal.visitor_id)).desc())
        )
    ).all()

    return {
        "period": period.as_dict(),
        "items": [
            {
                "path": row.path,
                "people": row.people or 0,
                "scrolled": row.scrolled or 0,
                "scrolled_pct": _pct(row.scrolled or 0, row.people or 0),
                "avg_seconds": round(float(row.avg_seconds), 1) if row.avg_seconds else 0.0,
                "acted": row.acted or 0,
                "acted_pct": _pct(row.acted or 0, row.people or 0),
            }
            for row in rows
        ],
    }


# ── What they wanted and we did not have ──────────────────────────────────────


async def unmet_demand(db: AsyncSession, period: Period, limit: int = 20) -> dict:
    """Searches that came back empty, and requests by category.

    The most direct demand signal the shop has, and the only one that names
    something that does not exist yet. A search that returns nothing is a
    person who came here wanting a specific thing, and left.
    """
    empty = (
        await db.execute(
            select(
                func.lower(func.trim(Signal.query)).label("query"),
                func.count(func.distinct(Signal.visitor_id)).label("people"),
            )
            .where(
                Signal.type == SignalType.search,
                Signal.query.is_not(None),
                # Recorded by the store when the search came back with nothing.
                Signal.value == 0,
                _within(Signal.created_at, period),
            )
            .group_by(func.lower(func.trim(Signal.query)))
            .order_by(func.count(func.distinct(Signal.visitor_id)).desc())
            .limit(limit)
        )
    ).all()

    asked = (
        await db.execute(
            select(
                Category.name_en,
                Category.name_ar,
                func.count().label("requests"),
                func.avg(cast(CustomRequest.budget, Float)).label("avg_budget"),
            )
            .join(Category, Category.id == CustomRequest.category_id)
            .where(_within(CustomRequest.created_at, period))
            .group_by(Category.name_en, Category.name_ar)
            .order_by(func.count().desc())
        )
    ).all()

    return {
        "period": period.as_dict(),
        "searched_and_found_nothing": [
            {"query": row.query, "people": row.people} for row in empty
        ],
        "asked_us_to_make": [
            {
                "category": row.name_en,
                "category_ar": row.name_ar,
                "requests": row.requests,
                "avg_budget": round(float(row.avg_budget), 0) if row.avg_budget else None,
            }
            for row in asked
        ],
    }


async def overview(db: AsyncSession, period: Period, limit: int | None = None) -> dict:
    """Everything the dashboard needs, in one call.

    The panel is opened on a phone on mobile data. Five round trips to draw
    one screen is the thing that makes a dashboard feel broken.

    `limit` reaches the two tables that silently truncate — the per-piece
    table at 60 rows and the unmet lists at 20. Before this it was a parameter
    on the service functions that nothing ever passed, so a shop with more
    than sixty pieces lost the tail with no indication.
    """
    return {
        "period": period.as_dict(),
        "audience": await audience(db, period),
        "funnel": await funnel(db, period),
        "pages": await by_page(db, period),
        "products": await by_product(db, period, **({"limit": limit} if limit else {})),
        "unmet": await unmet_demand(db, period, **({"limit": limit} if limit else {})),
    }
