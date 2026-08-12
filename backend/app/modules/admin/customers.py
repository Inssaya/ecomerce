"""Everyone who has ever bought something, or tried to.

Nobody needs an account to buy here (BRAND.md — the phone is the identity in
a cash-on-delivery market), so "the customers" are not rows in `users`; they
are the distinct people behind `orders`, some of whom happen to have an
account too. Grouping by `coalesce(customer_id, customer_phone)` is what makes
a guest and a registered account both count as one person instead of the
guest disappearing from the list entirely.

The whole `orders` table is walked in Python rather than aggregated in SQL.
That is a deliberate difference from `metrics.py`/`analytics.py`, which
aggregate in SQL because `signals` is a per-interaction table that can reach
hundreds of thousands of rows. Orders are one row per checkout in a
single-workshop shop — walking them in Python is simple to get right and the
table is nowhere near the size where that stops being true. If it ever is,
this is the function to rewrite, not the one to have over-optimised early.

**Likes and saves for a guest.** `ProductInteraction` is keyed on the visitor
fingerprint, and a guest has no `users` row for anything to join through — so
without `Order.visitor_id` a guest's hearts and saves would read zero forever.
Every order now carries the fingerprint it was placed from, so each customer
bucket collects the set of fingerprints it has ever ordered from, and that set
is what `ProductInteraction` and `Signal` are joined through below.
"""
from __future__ import annotations

import re
from collections import OrderedDict

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import get_or_404, not_found
from app.models import (
    InteractionKind,
    Order,
    OrderStatus,
    Product,
    ProductInteraction,
    Signal,
    SignalType,
    User,
)
from app.modules.admin.analytics import STAYED_SECONDS
from app.modules.admin.metrics import PAID_STATUSES, REFUSED_STATUSES
from app.modules.security import service as security_service

#: An order that will never be paid for, from the customer's side of the
#: ledger. `metrics.REFUSED_STATUSES` is about refusals at the door
#: specifically; a customer's own cancellation belongs in the same bucket here
#: because both mean "this did not become a sale."
CANCELLED_STATUSES = frozenset({OrderStatus.cancelled, *REFUSED_STATUSES})


def _people(*conditions) -> object:
    """Distinct visitors matching a condition, as a filtered aggregate — the
    same shape `analytics.py` uses, kept local rather than importing that
    module's underscore-prefixed helper across a module boundary."""
    return func.count(func.distinct(Signal.visitor_id)).filter(*conditions)


async def list_customers(db: AsyncSession, q: str | None = None) -> list[dict]:
    orders = list(
        await db.scalars(
            select(Order)
            .options(selectinload(Order.items))
            .order_by(Order.created_at.desc())
        )
    )

    # Insertion order follows the query's `created_at desc`, so the most
    # recently active customer sorts first with no extra pass — and the first
    # order seen for a bucket is its most recent, which is what should win for
    # display fields that can drift between orders (a name typo fixed later,
    # a phone that changed).
    buckets: OrderedDict[str, dict] = OrderedDict()
    for order in orders:
        key = order.customer_id or order.customer_phone
        bucket = buckets.get(key)
        if bucket is None:
            bucket = {
                "customer_id": order.customer_id,
                "phone": order.customer_phone,
                "name": order.customer_name,
                "email": order.customer_email,
                "city": order.city,
                "orders_count": 0,
                "revenue_mad": 0.0,
                "products_bought": 0,
                "products_cancelled": 0,
                "product_ids": set(),
                "visitor_ids": set(),
                "first_seen_at": order.created_at,
                "last_seen_at": order.created_at,
            }
            buckets[key] = bucket

        bucket["orders_count"] += 1
        quantity = sum(item.quantity for item in order.items)
        if order.status in PAID_STATUSES:
            bucket["revenue_mad"] += float(order.total)
            bucket["products_bought"] += quantity
        elif order.status in CANCELLED_STATUSES:
            bucket["products_cancelled"] += quantity
        for item in order.items:
            if item.product_id:
                bucket["product_ids"].add(item.product_id)
        if order.visitor_id:
            bucket["visitor_ids"].add(order.visitor_id)
        # Walked newest-first: the first order seen for a bucket is the most
        # recent, the last one seen is the oldest — "first_seen_at" is when
        # we first knew this person existed.
        bucket["first_seen_at"] = order.created_at

    account_ids = [key for key, bucket in buckets.items() if bucket["customer_id"]]
    accounts: dict[str, User] = {}
    if account_ids:
        rows = await db.scalars(select(User).where(User.id.in_(account_ids)))
        accounts = {user.id: user for user in rows}

    # Time on site can only be attributed via a fingerprint or an account —
    # both are available now, so a guest's dwell counts too.
    all_visitor_ids = {vid for bucket in buckets.values() for vid in bucket["visitor_ids"]}
    dwell_by_visitor: dict[str, int] = {}
    if all_visitor_ids:
        rows = await db.execute(
            select(Signal.visitor_id, func.coalesce(func.sum(Signal.value), 0))
            .where(Signal.type == SignalType.dwell, Signal.visitor_id.in_(all_visitor_ids))
            .group_by(Signal.visitor_id)
        )
        dwell_by_visitor = dict(rows.all())
    dwell_by_account: dict[str, int] = {}
    if account_ids:
        rows = await db.execute(
            select(Signal.user_id, func.coalesce(func.sum(Signal.value), 0))
            .where(Signal.type == SignalType.dwell, Signal.user_id.in_(account_ids))
            .group_by(Signal.user_id)
        )
        dwell_by_account = dict(rows.all())

    # Likes and saves, the same guest-vs-account split, and for the same
    # reason: a row with a `user_id` is counted once, through the account —
    # never twice by also matching one of that account's fingerprints.
    likes_by_visitor, saves_by_visitor = await _interaction_totals(
        db, visitor_ids=all_visitor_ids, account_ids=None
    )
    likes_by_account, saves_by_account = await _interaction_totals(
        db, visitor_ids=None, account_ids=account_ids
    )

    term = q.strip().lower() if q else None
    out: list[dict] = []
    for key, bucket in buckets.items():
        account = accounts.get(bucket["customer_id"]) if bucket["customer_id"] else None
        name = bucket["name"]
        phone = bucket["phone"]
        email = account.email if account else bucket["email"]
        if term and term not in " ".join(
            filter(None, [name.lower(), phone, (email or "").lower()])
        ):
            continue

        if account:
            dwell = dwell_by_account.get(account.id, 0)
            likes = likes_by_account.get(account.id, 0)
            saves = saves_by_account.get(account.id, 0)
        else:
            dwell = sum(dwell_by_visitor.get(vid, 0) for vid in bucket["visitor_ids"])
            likes = sum(likes_by_visitor.get(vid, 0) for vid in bucket["visitor_ids"])
            saves = sum(saves_by_visitor.get(vid, 0) for vid in bucket["visitor_ids"])

        out.append(
            {
                "id": key,
                "has_account": account is not None,
                "type": "auth" if account is not None else "guest",
                "name": name,
                "phone": phone,
                "email": email,
                "city": bucket["city"],
                "created_at": bucket["first_seen_at"].isoformat(),
                "created_account_at": account.created_at.isoformat() if account else None,
                "is_active": account.is_active if account else None,
                "orders_count": bucket["orders_count"],
                "revenue_mad": round(bucket["revenue_mad"], 2),
                "products_bought": bucket["products_bought"],
                "products_cancelled": bucket["products_cancelled"],
                "total_products": len(bucket["product_ids"]),
                "total_likes": likes,
                "total_saves": saves,
                "time_on_site_seconds": dwell or None,
            }
        )
    return out


async def _interaction_totals(
    db: AsyncSession, *, visitor_ids: set[str] | None, account_ids: list[str] | None
) -> tuple[dict[str, int], dict[str, int]]:
    """Likes and saves, grouped by whichever identity was asked for.

    Called twice by `list_customers` — once for fingerprints (guest rows
    only, `user_id IS NULL`) and once for accounts (any row with that
    `user_id`, fingerprint or not) — so that a signed-in visitor's reaction is
    counted exactly once, through the account, never twice.
    """
    likes: dict[str, int] = {}
    saves: dict[str, int] = {}
    if visitor_ids:
        rows = await db.execute(
            select(ProductInteraction.visitor_id, ProductInteraction.kind, func.count())
            .where(
                ProductInteraction.visitor_id.in_(visitor_ids),
                ProductInteraction.user_id.is_(None),
            )
            .group_by(ProductInteraction.visitor_id, ProductInteraction.kind)
        )
        for visitor_id, kind, count in rows.all():
            (likes if kind is InteractionKind.like else saves)[visitor_id] = int(count)
    if account_ids:
        rows = await db.execute(
            select(ProductInteraction.user_id, ProductInteraction.kind, func.count())
            .where(ProductInteraction.user_id.in_(account_ids))
            .group_by(ProductInteraction.user_id, ProductInteraction.kind)
        )
        for user_id, kind, count in rows.all():
            (likes if kind is InteractionKind.like else saves)[user_id] = int(count)
    return likes, saves


#: A customer's `id` is a real account UUID, or — for a guest — their phone
#: number, because a guest has no row in `users` to be identified by.
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


async def _identity(db: AsyncSession, customer_id: str) -> tuple[User | None, set[str]]:
    """Resolve one customer id back to an account (maybe) and every
    fingerprint they have ever ordered from. Shared by the analytics view and
    the block action so both see the same person the list did."""
    is_account = bool(_UUID.match(customer_id))
    query = select(Order.visitor_id).where(
        Order.customer_id == customer_id if is_account else Order.customer_phone == customer_id
    )
    visitor_ids = {row for row in (await db.scalars(query)) if row}
    account = await db.get(User, customer_id) if is_account else None
    return account, visitor_ids


async def customer_analytics(db: AsyncSession, customer_id: str) -> dict:
    """One person's behaviour: visits, the funnel, dwell, and what they have
    hearted or saved. All-time — a customer profile is not a report with a
    date range, it is the whole relationship."""
    account, visitor_ids = await _identity(db, customer_id)
    if account is None and not visitor_ids:
        raise not_found("No behaviour on record for this customer")

    condition = Signal.user_id == account.id if account else Signal.visitor_id.in_(visitor_ids)

    row = (
        await db.execute(
            select(
                func.count(func.distinct(func.date(Signal.created_at))).label("visits"),
                _people(Signal.type == SignalType.click).label("opened"),
                _people(
                    Signal.type == SignalType.dwell, Signal.value >= STAYED_SECONDS
                ).label("stayed"),
                func.coalesce(
                    func.sum(case((Signal.type == SignalType.dwell, Signal.value))), 0
                ).label("dwell_seconds"),
                _people(Signal.type == SignalType.add_to_cart).label("added"),
                _people(Signal.type == SignalType.purchase).label("bought"),
            ).where(condition)
        )
    ).one()

    interaction_condition = (
        ProductInteraction.user_id == account.id
        if account
        else ProductInteraction.visitor_id.in_(visitor_ids)
    )
    reactions = (
        await db.execute(
            select(Product.id, Product.slug, Product.title_en, ProductInteraction.kind)
            .join(ProductInteraction, ProductInteraction.product_id == Product.id)
            .where(interaction_condition)
            .order_by(ProductInteraction.created_at.desc())
        )
    ).all()
    liked = [
        {"id": pid, "slug": slug, "title": title}
        for pid, slug, title, kind in reactions
        if kind is InteractionKind.like
    ]
    saved = [
        {"id": pid, "slug": slug, "title": title}
        for pid, slug, title, kind in reactions
        if kind is InteractionKind.save
    ]

    return {
        "visits": int(row.visits or 0),
        "opened": int(row.opened or 0),
        "stayed": int(row.stayed or 0),
        "dwell_seconds": int(row.dwell_seconds or 0),
        "added_to_cart": int(row.added or 0),
        "purchased": int(row.bought or 0),
        "liked": liked,
        "saved": saved,
    }


async def set_customer_active(db: AsyncSession, user_id: str, active: bool) -> User:
    """Ban or unban an account. Guests have none to flip — this only ever
    touches `users`, never an order.

    The identifier is checked before it reaches the query: a guest's "id" is a
    phone number, and handing a phone number to a UUID column raises a database
    error rather than a 404, so a mis-aimed call used to come back as a 500.
    """
    if not _UUID.match(user_id):
        raise not_found("That customer checked out as a guest — there is no account to change")
    user = await get_or_404(db, User, user_id, detail="Customer not found")
    user.is_active = active
    await db.commit()
    await db.refresh(user)
    return user


async def block_customer(
    db: AsyncSession, customer_id: str, *, reason: str, deactivate_account: bool
) -> dict:
    """Block every device this customer has ordered from, and optionally
    deactivate their account in the same action.

    Device blocks here are always fingerprint blocks, permanent until lifted
    — there is no IP on an order to block by. The account toggle is the same
    move `set_customer_active` already makes; this just offers both from one
    confirm, since "block this customer" is the sentence the owner is
    actually reading, not "deactivate this account" and "block this device"
    as two separate decisions.
    """
    account, visitor_ids = await _identity(db, customer_id)
    if account is None and not visitor_ids:
        raise not_found("Nothing to block — no orders or account on this customer")

    blocked = []
    for visitor_id in visitor_ids:
        blocked.extend(
            await security_service.create_block(db, reason=reason, visitor_id=visitor_id, ip=None)
        )

    if deactivate_account and account is not None:
        account.is_active = False
        await db.commit()
        await db.refresh(account)

    return {
        "devices_blocked": len(blocked),
        "account_deactivated": bool(deactivate_account and account is not None),
    }
