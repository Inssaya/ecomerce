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
"""
from __future__ import annotations

from collections import OrderedDict

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import get_or_404
from app.models import Order, OrderStatus, Signal, SignalType, User
from app.modules.admin.metrics import PAID_STATUSES, REFUSED_STATUSES

#: An order that will never be paid for, from the customer's side of the
#: ledger. `metrics.REFUSED_STATUSES` is about refusals at the door
#: specifically; a customer's own cancellation belongs in the same bucket here
#: because both mean "this did not become a sale."
CANCELLED_STATUSES = frozenset({OrderStatus.cancelled, *REFUSED_STATUSES})


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
                "orders_count": 0,
                "revenue_mad": 0.0,
                "products_bought": 0,
                "products_cancelled": 0,
            }
            buckets[key] = bucket

        bucket["orders_count"] += 1
        quantity = sum(item.quantity for item in order.items)
        if order.status in PAID_STATUSES:
            bucket["revenue_mad"] += float(order.total)
            bucket["products_bought"] += quantity
        elif order.status in CANCELLED_STATUSES:
            bucket["products_cancelled"] += quantity

    account_ids = [key for key, bucket in buckets.items() if bucket["customer_id"]]
    accounts: dict[str, User] = {}
    if account_ids:
        rows = await db.scalars(select(User).where(User.id.in_(account_ids)))
        accounts = {user.id: user for user in rows}

    # Time on site can only be attributed to a signed-in customer — a guest's
    # dwell signals sit under a `visitor_id` that nothing on `Order` links
    # back to. Decided out of scope rather than adding a column for it.
    dwell_seconds: dict[str, int] = {}
    if account_ids:
        rows = await db.execute(
            select(Signal.user_id, func.coalesce(func.sum(Signal.value), 0))
            .where(Signal.type == SignalType.dwell, Signal.user_id.in_(account_ids))
            .group_by(Signal.user_id)
        )
        dwell_seconds = dict(rows.all())

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
        out.append(
            {
                "id": key,
                "has_account": account is not None,
                "name": name,
                "phone": phone,
                "email": email,
                "created_account_at": account.created_at.isoformat() if account else None,
                "is_active": account.is_active if account else None,
                "orders_count": bucket["orders_count"],
                "revenue_mad": round(bucket["revenue_mad"], 2),
                "products_bought": bucket["products_bought"],
                "products_cancelled": bucket["products_cancelled"],
                "time_on_site_seconds": (
                    dwell_seconds.get(bucket["customer_id"]) if account else None
                ),
            }
        )
    return out


async def set_customer_active(db: AsyncSession, user_id: str, active: bool) -> User:
    """Ban or unban an account. Guests have none to flip — this only ever
    touches `users`, never an order."""
    user = await get_or_404(db, User, user_id, detail="Customer not found")
    user.is_active = active
    await db.commit()
    await db.refresh(user)
    return user
