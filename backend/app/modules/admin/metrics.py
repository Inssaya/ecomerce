"""The numbers, computed once.

Every figure the panel shows and every figure the copilot can cite comes from
this file. That is deliberate: if the assistant computed its own totals they
would eventually disagree with the screen, and an owner who catches the AI
contradicting the dashboard will never trust either again.

The metric that matters most here is the refusal rate. BRAND.md §6: in a
cash-on-delivery market 15–30% of packages are refused at the door, it is the
largest silent cost in the business, and the target is below 8%. Nothing else
in the panel is worth as much as knowing that number and what drives it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Category,
    ContactMessage,
    Order,
    OrderItem,
    OrderStatus,
    Piece,
    PieceAlert,
    PieceState,
    Product,
    ProductStatus,
    Signal,
    SignalType,
)
from app.models.requests import CustomRequest, RequestStatus

#: An order that reached the door and did not stay there.
REFUSED_STATUSES = (OrderStatus.failed, OrderStatus.returned)
#: Money actually collected.
PAID_STATUSES = (OrderStatus.delivered,)


@dataclass(slots=True)
class Period:
    start: date
    end: date

    @classmethod
    def last(cls, days: int) -> Period:
        today = date.today()
        return cls(start=today - timedelta(days=days - 1), end=today)

    @property
    def days(self) -> int:
        return (self.end - self.start).days + 1

    def previous(self) -> Period:
        return Period(start=self.start - timedelta(days=self.days), end=self.start - timedelta(days=1))

    def as_dict(self) -> dict[str, str]:
        return {"from": self.start.isoformat(), "to": self.end.isoformat()}


@dataclass(slots=True, frozen=True)
class Scope:
    """What slice of the shop a number is about.

    REBUILD-PLAN §3: one scope drives the whole page — pick a category or a
    piece once and every figure below re-reads for it.

    Not every figure *can* honour it, and pretending otherwise would be worse
    than not offering it. Signals carry both ids, so audience, funnel and
    conversion narrow exactly. Orders narrow through their line items. The
    work queue never narrows: "what needs me today" is a question about the
    whole shop, and a scoped queue would hide work rather than focus it —
    so it is reported as shop-wide and the screen says so.
    """

    category_id: str | None = None
    product_id: str | None = None

    @property
    def active(self) -> bool:
        return bool(self.category_id or self.product_id)

    def signal_conditions(self) -> list:
        """A piece beats a category — the narrower wins."""
        if self.product_id:
            return [Signal.product_id == self.product_id]
        if self.category_id:
            return [Signal.category_id == self.category_id]
        return []

    def order_condition(self):
        """An order is in scope when it contains a line that is."""
        if not self.active:
            return None
        lines = select(OrderItem.id).where(OrderItem.order_id == Order.id)
        if self.product_id:
            lines = lines.where(OrderItem.product_id == self.product_id)
        else:
            lines = lines.join(Product, Product.id == OrderItem.product_id).where(
                Product.category_id == self.category_id
            )
        return lines.exists()

    def as_dict(self) -> dict:
        return {
            "category_id": self.category_id,
            "product_id": self.product_id,
            "active": self.active,
        }


#: Used when a caller does not scope at all.
WHOLE_SHOP = Scope()


def _within(column, period: Period):
    return column.between(period.start, period.end + timedelta(days=1))


def _scoped(query, scope: Scope, *, orders: bool = False):
    """Apply a scope to a query, if there is one to apply."""
    if not scope.active:
        return query
    if orders:
        condition = scope.order_condition()
        return query.where(condition) if condition is not None else query
    return query.where(*scope.signal_conditions())


async def pulse(db: AsyncSession) -> dict:
    """Today, at a glance. The screen the owner opens on."""
    today = Period.last(1)
    orders_today = await db.scalar(
        select(func.count()).select_from(Order).where(_within(Order.created_at, today))
    )
    collected_today = await db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            Order.status.in_(PAID_STATUSES), _within(Order.updated_at, today)
        )
    )
    visitors_today = await db.scalar(
        select(func.count(func.distinct(Signal.visitor_id))).where(
            _within(Signal.created_at, today)
        )
    )
    open_orders = await db.scalar(
        select(func.count())
        .select_from(Order)
        .where(Order.status.notin_([*PAID_STATUSES, OrderStatus.cancelled, OrderStatus.returned]))
    )
    open_requests = await db.scalar(
        select(func.count())
        .select_from(CustomRequest)
        .where(CustomRequest.status == RequestStatus.requested)
    )
    return {
        "date": today.end.isoformat(),
        "orders_today": orders_today or 0,
        "collected_today_mad": float(collected_today or 0),
        "visitors_today": visitors_today or 0,
        "open_orders": open_orders or 0,
        "requests_waiting_on_a_quote": open_requests or 0,
    }


async def revenue(db: AsyncSession, period: Period, scope: Scope = WHOLE_SHOP) -> dict:
    """What was collected, against the same length of time before it."""

    async def totals(window: Period) -> tuple[int, float]:
        count = await db.scalar(
            _scoped(
                select(func.count())
                .select_from(Order)
                .where(Order.status.in_(PAID_STATUSES), _within(Order.updated_at, window)),
                scope,
                orders=True,
            )
        )
        amount = await db.scalar(
            _scoped(
                select(func.coalesce(func.sum(Order.total), 0)).where(
                    Order.status.in_(PAID_STATUSES), _within(Order.updated_at, window)
                ),
                scope,
                orders=True,
            )
        )
        return count or 0, float(amount or 0)

    orders, amount = await totals(period)
    before_orders, before_amount = await totals(period.previous())

    # A day-by-day series, so the tile can carry a sparkline. Visitors already
    # had one; revenue — the more useful of the two to an owner — did not.
    # Every day in the window is present, including the empty ones: a chart
    # with the quiet days missing lies about the shape of a week.
    collected_by_day = dict(
        (row.day, float(row.total))
        for row in await db.execute(
            _scoped(
                select(
                    func.date(Order.updated_at).label("day"),
                    func.coalesce(func.sum(Order.total), 0).label("total"),
                ).where(Order.status.in_(PAID_STATUSES), _within(Order.updated_at, period)),
                scope,
                orders=True,
            ).group_by(func.date(Order.updated_at))
        )
    )
    daily = []
    cursor = period.start
    while cursor <= period.end:
        daily.append({"date": cursor.isoformat(), "mad": collected_by_day.get(cursor, 0.0)})
        cursor += timedelta(days=1)

    return {
        "period": period.as_dict(),
        "orders_delivered": orders,
        "collected_mad": amount,
        "average_order_mad": round(amount / orders, 2) if orders else 0.0,
        "previous_period": {"orders_delivered": before_orders, "collected_mad": before_amount},
        "change_mad": round(amount - before_amount, 2),
        "daily": daily,
    }


async def refusals(db: AsyncSession, period: Period, scope: Scope = WHOLE_SHOP) -> dict:
    """The number that decides whether this business works.

    A refused package pays shipping twice and earns nothing. Anything at or
    above the market's usual 15% means people are being surprised by the box.
    """
    reached_door = await db.scalar(
        _scoped(
            select(func.count())
            .select_from(Order)
            .where(
                Order.status.in_([*PAID_STATUSES, *REFUSED_STATUSES]),
                _within(Order.updated_at, period),
            ),
            scope,
            orders=True,
        )
    )
    refused = await db.scalar(
        _scoped(
            select(func.count())
            .select_from(Order)
            .where(Order.status.in_(REFUSED_STATUSES), _within(Order.updated_at, period)),
            scope,
            orders=True,
        )
    )
    rate = round(100 * (refused or 0) / reached_door, 1) if reached_door else 0.0

    by_city = (
        await db.execute(
            _scoped(
                select(
                    Order.city,
                    func.count().filter(Order.status.in_(REFUSED_STATUSES)).label("refused"),
                    func.count().label("total"),
                ).where(
                    Order.status.in_([*PAID_STATUSES, *REFUSED_STATUSES]),
                    _within(Order.updated_at, period),
                ),
                scope,
                orders=True,
            )
            .group_by(Order.city)
            .order_by(func.count().filter(Order.status.in_(REFUSED_STATUSES)).desc())
            .limit(10)
        )
    ).all()

    return {
        "period": period.as_dict(),
        "delivered_or_attempted": reached_door or 0,
        "refused": refused or 0,
        "refusal_rate_pct": rate,
        "target_pct": 8.0,
        "worst_cities": [
            {"city": city, "refused": refused_count, "attempted": total}
            for city, refused_count, total in by_city
            if refused_count
        ],
    }


async def what_to_make_next(db: AsyncSession, period: Period) -> dict:
    """The only question a workshop really has.

    Three sources, in descending order of how direct they are: what people
    asked us to make, what they searched for and did not find, and which
    categories are pulling attention.
    """
    asked_for = list(
        await db.scalars(
            select(CustomRequest.description)
            .where(
                CustomRequest.status.in_([RequestStatus.requested, RequestStatus.quoted]),
                _within(CustomRequest.created_at, period),
            )
            .order_by(CustomRequest.created_at.desc())
            .limit(20)
        )
    )
    searched = (
        await db.execute(
            select(func.lower(Signal.query), func.count())
            .where(
                Signal.type == SignalType.search,
                Signal.query.is_not(None),
                _within(Signal.created_at, period),
            )
            .group_by(func.lower(Signal.query))
            .order_by(func.count().desc())
            .limit(15)
        )
    ).all()
    attention = (
        await db.execute(
            select(Category.name_en, func.sum(Signal.weight))
            .join(Category, Category.id == Signal.category_id)
            .where(_within(Signal.created_at, period))
            .group_by(Category.name_en)
            .order_by(func.sum(Signal.weight).desc())
            .limit(10)
        )
    ).all()
    return {
        "period": period.as_dict(),
        "people_asked_us_to_make": asked_for,
        "searched_for": [{"query": query, "times": count} for query, count in searched],
        "categories_earning_attention": [
            {"category": name, "score": round(float(score), 1)} for name, score in attention
        ],
    }


async def shelf_state(db: AsyncSession) -> dict:
    """What is running out and what is not moving.

    Dead stock is capital sitting on a bench. In a workshop it is worse than in
    a shop, because it is also machine hours that could have made something
    someone wanted.
    """
    rows = (
        await db.execute(
            select(
                Product.id,
                Product.title_en,
                Product.slug,
                func.count(Piece.id).filter(Piece.state == PieceState.available).label("available"),
                func.count(Piece.id).filter(Piece.state == PieceState.sold).label("sold"),
                Product.created_at,
            )
            .join(Piece, Piece.product_id == Product.id, isouter=True)
            .where(Product.status == ProductStatus.active, Product.kind == "shelf")
            .group_by(Product.id)
        )
    ).all()

    running_out, not_moving = [], []
    stale_before = date.today() - timedelta(days=45)
    for product_id, title, slug, available, sold, created_at in rows:
        # The id was selected and then discarded, so every shelf row named a
        # piece the owner had no way to open. It is the whole point of the row.
        entry = {"product_id": product_id, "title": title, "slug": slug, "available": available, "sold": sold}
        if available == 0:
            entry["note"] = "nothing left"
            running_out.append(entry)
        elif available <= 2:
            running_out.append(entry)
        elif sold == 0 and created_at.date() < stale_before:
            not_moving.append(entry)

    return {
        "running_out": sorted(running_out, key=lambda row: row["available"]),
        "not_moving": sorted(not_moving, key=lambda row: -row["available"]),
    }


async def best_sellers(db: AsyncSession, period: Period, limit: int = 10) -> dict:
    rows = (
        await db.execute(
            select(
                OrderItem.title,
                func.sum(OrderItem.quantity).label("sold"),
                func.sum(OrderItem.subtotal).label("revenue"),
                # Grouped by the snapshot title on purpose — that is what was
                # actually sold, and it survives the piece being renamed. This
                # is only so the row can link somewhere; if one title was sold
                # under two products it picks one, and the id may be null for a
                # piece that no longer exists, which the console handles.
                # Cast to text because Postgres has no max() over uuid, and the
                # value is only ever used as a string in a URL.
                func.max(cast(OrderItem.product_id, String)).label("product_id"),
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.status.in_(PAID_STATUSES), _within(Order.updated_at, period))
            .group_by(OrderItem.title)
            .order_by(func.sum(OrderItem.subtotal).desc())
            .limit(limit)
        )
    ).all()
    return {
        "period": period.as_dict(),
        "pieces": [
            {
                "title": title,
                "sold": int(sold),
                "revenue_mad": float(revenue_),
                "product_id": product_id,
            }
            for title, sold, revenue_, product_id in rows
        ],
    }


async def conversion(db: AsyncSession, period: Period, scope: Scope = WHOLE_SHOP) -> dict:
    """How many of the people who looked ended up buying."""
    visitors = await db.scalar(
        _scoped(
            select(func.count(func.distinct(Signal.visitor_id))).where(
                _within(Signal.created_at, period)
            ),
            scope,
        )
    )
    orders = await db.scalar(
        _scoped(
            select(func.count()).select_from(Order).where(_within(Order.created_at, period)),
            scope,
            orders=True,
        )
    )
    carts = await db.scalar(
        _scoped(
            select(func.count(func.distinct(Signal.visitor_id))).where(
                Signal.type == SignalType.add_to_cart, _within(Signal.created_at, period)
            ),
            scope,
        )
    )
    return {
        "period": period.as_dict(),
        "visitors": visitors or 0,
        "put_something_in_a_cart": carts or 0,
        "orders_placed": orders or 0,
        "visitor_to_order_pct": round(100 * (orders or 0) / visitors, 1) if visitors else 0.0,
        "cart_to_order_pct": round(100 * (orders or 0) / carts, 1) if carts else 0.0,
    }


async def money_block(db: AsyncSession, period: Period, scope: Scope = WHOLE_SHOP) -> dict:
    """Revenue, refusals and conversion together — the money view of a period."""
    return {
        "revenue": await revenue(db, period, scope),
        "refusals": await refusals(db, period, scope),
        "conversion": await conversion(db, period, scope),
    }


async def unread_messages(db: AsyncSession) -> int:
    """Contact-form messages nobody has read.

    The console used to count these only once the owner had already opened the
    Messages tab — a badge that appears after you arrive is decoration. It is
    part of the Board's one call now, so it is right before you go looking.
    """
    total = await db.scalar(
        select(func.count())
        .select_from(ContactMessage)
        .where(ContactMessage.read_at.is_(None), ContactMessage.archived_at.is_(None))
    )
    return total or 0


async def waiting_list(db: AsyncSession, limit: int = 50) -> list[dict]:
    """Who is waiting on which piece, newest demand first.

    `piece_alerts` is the most direct signal in the building: a search says
    somebody typed a word, this says somebody would have paid, for a specific
    piece, at a price they had already seen. Until now the only way to read it
    was one product at a time, as a bare count.
    """
    rows = await db.execute(
        select(
            PieceAlert.product_id,
            Product.title_en,
            Product.slug,
            func.count().label("waiting"),
            func.min(PieceAlert.created_at).label("since"),
        )
        .join(Product, Product.id == PieceAlert.product_id)
        .where(PieceAlert.notified_at.is_(None))
        .group_by(PieceAlert.product_id, Product.title_en, Product.slug)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [
        {
            "product_id": row.product_id,
            "title": row.title_en,
            "slug": row.slug,
            "waiting": row.waiting,
            "since": row.since.isoformat() if row.since else None,
        }
        for row in rows
    ]


#: Plain-language explanations, so the panel makes the owner better at running
#: the business rather than only showing numbers (REBUILD-PLAN §7).
KPI_EXPLANATIONS: dict[str, tuple[str, str]] = {
    "refusal_rate": (
        "Out of every hundred packages that reached someone's door, how many came back. "
        "It is the biggest hidden cost in cash-on-delivery selling: a refused package pays "
        "shipping both ways and earns nothing. The usual figure in this market is 15 to 30. "
        "Below 8 is the target, and it is reached by answering questions before the sale, "
        "not after.",
        "من كل مئة طرد وصل إلى باب الزبون، كم طرداً عاد إلينا. هذه أكبر تكلفة خفية في البيع "
        "عند الاستلام: الطرد المرفوض يدفع الشحن مرّتين ولا يعود بشيء. المعدّل المعتاد في السوق "
        "بين 15 و30. هدفنا أقل من 8، ويُبلغ بالإجابة عن الأسئلة قبل البيع لا بعده.",
    ),
    "average_order": (
        "What a delivered order is worth on average. It rises when someone buys two things "
        "instead of one, which is what the feed and the assistant are for.",
        "متوسط قيمة الطلب المُسلَّم. يرتفع حين يشتري الزبون قطعتين بدل واحدة، وهذا ما يخدمه "
        "التوزيع الذكي والمساعد.",
    ),
    "cart_to_order": (
        "Out of every hundred people who put something in a cart, how many finished. "
        "A low number means the checkout is asking too much, or the delivery cost or the "
        "date surprised them at the last step.",
        "من كل مئة شخص وضع شيئاً في السلة، كم واحداً أتمّ الطلب. الرقم المنخفض يعني أن صفحة "
        "الأداء تطلب الكثير، أو أن ثمن التوصيل أو التاريخ فاجأه في آخر خطوة.",
    ),
    "visitor_to_order": (
        "Out of every hundred people who visited, how many ordered. Low single digits are "
        "normal. Watch which way it moves, not what it is.",
        "من كل مئة زائر، كم واحداً طلب. الأرقام المنخفضة طبيعية. المهم اتجاه الرقم لا قيمته.",
    ),
    "not_moving": (
        "Pieces on the shelf that nobody has bought in six weeks. In a workshop this is worse "
        "than in a shop: it is not only money sitting there, it is machine hours that could "
        "have made something someone actually wanted.",
        "قطع على الرف لم يشترها أحد منذ ستة أسابيع. في الورشة هذا أسوأ منه في المتجر: ليست "
        "أموالاً معطّلة فحسب، بل ساعات آلة كان يمكن أن تصنع شيئاً يريده أحدهم فعلاً.",
    ),
}
