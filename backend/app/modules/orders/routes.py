"""Checkout, tracking and the owner's order list.

Cash on delivery is the only payment method, so there is no payment step: an
order is placed, then it is made, then someone hands it over and takes the
cash.
"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.errors import get_or_404
from app.core.limits import CheckoutLimit, LookupLimit
from app.deps import CurrentUser, DbSession, OptionalUser, Owner, Paging, Visitor
from app.models import Order, OrderStatus
from app.modules.notify.service import whatsapp_url
from app.modules.orders import service
from app.modules.orders.schemas import (
    CheckoutRequest,
    FindOrder,
    MyOrders,
    OrderResponse,
    PromiseChange,
    StatusChange,
)

router = APIRouter(tags=["orders"])


def _out_one(order: Order, categories: dict[str, tuple[str | None, str | None]]) -> OrderResponse:
    """One order, with everything the console's item table wants attached."""
    response = OrderResponse.model_validate(order)
    response.whatsapp_url = whatsapp_url(order)
    response.has_account = order.customer_id is not None
    response.hidden = order.hidden_at is not None
    for item, out_item in zip(order.items, response.items):
        category, subcategory = categories.get(item.product_id, (None, None))
        out_item.category = category
        out_item.subcategory = subcategory
    return response


async def _out(db: DbSession, order: Order) -> OrderResponse:
    """Single-order read path: resolve its own items' categories and go."""
    categories = await service.item_categories(db, [order])
    return _out_one(order, categories)


async def _out_many(db: DbSession, orders: list[Order]) -> list[OrderResponse]:
    """A page of orders, with every item's category resolved in one query
    rather than one per order."""
    categories = await service.item_categories(db, orders)
    return [_out_one(order, categories) for order in orders]


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def checkout(
    body: CheckoutRequest,
    db: DbSession,
    user: OptionalUser,
    visitor: Visitor,
    _: CheckoutLimit,
) -> OrderResponse:
    """No account required. In a market where trust is the scarce thing, an
    account gate before the first purchase is a lost purchase.

    The visitor fingerprint travels with the order so a guest's hearts and
    saves can still roll up under their phone bucket in the customer view.
    Missing here is fine — an order from a browser with no fingerprint just
    joins nothing later, which is what used to happen for everything.
    """
    order = await service.place_order(db, body, user, visitor)
    return await _out(db, order)


@router.get("/orders/mine", response_model=MyOrders)
async def my_orders(user: CurrentUser, db: DbSession) -> MyOrders:
    """Everything this account has bought, and what it came to.

    Only orders actually placed while signed in appear here. Buying needs no
    account, so a customer who checked out as a guest — which is most of them —
    has orders keyed to a phone number and reachable through `/orders/find`,
    not through this. Claiming those by matching on the phone would hand one
    person's order history to anyone who registered with their number.

    `total_spent` counts delivered orders only. Money is collected at the door,
    so an order that was placed, or refused, or came back to the workshop is
    not money the shop has.
    """
    orders = (
        await db.scalars(
            select(Order)
            .where(Order.customer_id == user.id)
            .order_by(Order.created_at.desc())
        )
    ).all()
    spent = sum(
        float(order.total) for order in orders if order.status is OrderStatus.delivered
    )
    return MyOrders(
        orders=await _out_many(db, list(orders)),
        total_spent=spent,
        delivered=sum(1 for o in orders if o.status is OrderStatus.delivered),
    )


@router.get("/orders/track/{tracking_token}", response_model=OrderResponse)
async def track(tracking_token: str, db: DbSession) -> OrderResponse:
    """The link sent to the customer. The token is the credential — it is long
    and random precisely so this page needs no login.

    Not filtered on `hidden_at`: hiding an order is an admin view preference,
    and the person waiting for their package still needs to be able to find
    it here regardless of what the console shows them under.
    """
    order = await get_or_404(
        db, Order, tracking_token, field="tracking_token", detail="We can't find that order"
    )
    return await _out(db, order)


@router.post("/orders/find", response_model=OrderResponse)
async def find_order(body: FindOrder, db: DbSession, _: LookupLimit) -> OrderResponse:
    """Find an order from the reference and the phone number.

    People lose the tracking link. They close the tab, they clear WhatsApp,
    they ordered from a friend's phone — and then the only way back in was a
    link they no longer have. Every shop needs this, and a shop where the
    customer is waiting for a courier to knock needs it more than most.

    Both must match. The reference alone is short enough to be guessed at
    eventually; the reference *and* the number belonging to it is not, and this
    endpoint is rate-limited on top. Also not filtered on `hidden_at` — see
    `track` above.
    """
    order = await db.scalar(
        select(Order).where(
            Order.reference == body.reference.strip().upper(),
            Order.customer_phone == body.phone,
        )
    )
    if order is None:
        # One message for both failures, so this cannot be used to find out
        # which references exist.
        raise HTTPException(
            status_code=404, detail="No order with that reference and phone number"
        )
    return await _out(db, order)


# ── Owner ─────────────────────────────────────────────────────────────────────


@router.get("/admin/orders", response_model=list[OrderResponse])
async def list_orders(
    db: DbSession,
    owner: Owner,
    paging: Paging,
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, min_length=2, max_length=60),
    city: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    hidden: bool = Query(default=False, description="Show the archived view instead of the live one"),
) -> list[OrderResponse]:
    """The queue. `hidden=false` (the default) is the live view — everything
    archived drops out of it. `hidden=true` is the archive itself, not
    "everything including hidden": a Delete you can undo is only useful if
    the undo view is not mixed back in with the working one."""
    query = select(Order)
    if hidden:
        query = query.where(Order.hidden_at.is_not(None))
    else:
        query = query.where(Order.hidden_at.is_(None))
    if status_filter is not None:
        query = query.where(Order.status == status_filter)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(
            Order.reference.ilike(term)
            | Order.customer_phone.ilike(term)
            | Order.customer_name.ilike(term)
        )
    if city:
        query = query.where(Order.city.ilike(city))
    if date_from:
        query = query.where(Order.created_at >= date_from)
    if date_to:
        query = query.where(Order.created_at < date_to + timedelta(days=1))
    rows = await db.scalars(
        query.order_by(Order.created_at.desc()).offset(paging.offset).limit(paging.size)
    )
    return await _out_many(db, list(rows.unique()))


@router.get("/admin/orders/cities")
async def order_cities(db: DbSession, owner: Owner) -> list[str]:
    """What the dynamic City filter offers: only cities an order has actually
    shipped to, not the master list of places the shop delivers. Hidden
    orders are excluded — an archived one-off to a city the shop no longer
    really serves should not keep cluttering the filter forever."""
    rows = await db.scalars(
        select(Order.city).where(Order.hidden_at.is_(None)).distinct().order_by(Order.city)
    )
    return [city for city in rows if city]


@router.get("/admin/orders/{reference}", response_model=OrderResponse)
async def get_order(reference: str, db: DbSession, owner: Owner) -> OrderResponse:
    order = await get_or_404(
        db, Order, reference.upper(), field="reference", detail="Order not found"
    )
    return await _out(db, order)


@router.post("/admin/orders/{reference}/status", response_model=OrderResponse)
async def set_status(
    reference: str, body: StatusChange, db: DbSession, owner: Owner
) -> OrderResponse:
    """The owner moves the order; the customer is told automatically. Nobody
    should have to ask where their package is."""
    order = await get_or_404(
        db, Order, reference.upper(), field="reference", detail="Order not found"
    )
    order = await service.change_status(db, order, body.status, body.note, actor="workshop")
    return await _out(db, order)


@router.post("/admin/orders/{reference}/promise", response_model=OrderResponse)
async def set_promise(
    reference: str, body: PromiseChange, db: DbSession, owner: Owner
) -> OrderResponse:
    """Move the date the countdown counts to — no email, no status change,
    just the number the order and tracking pages both read."""
    order = await get_or_404(
        db, Order, reference.upper(), field="reference", detail="Order not found"
    )
    order = await service.set_promise(db, order, body.promised_for)
    return await _out(db, order)


@router.post("/admin/orders/{reference}/hide", response_model=OrderResponse)
async def hide_order(reference: str, db: DbSession, owner: Owner) -> OrderResponse:
    """"Delete", in a shop where an order is an accounting record: it leaves
    the working queue and stays reachable from the Hidden view."""
    order = await get_or_404(
        db, Order, reference.upper(), field="reference", detail="Order not found"
    )
    order = await service.hide_order(db, order)
    return await _out(db, order)


@router.post("/admin/orders/{reference}/unhide", response_model=OrderResponse)
async def unhide_order(reference: str, db: DbSession, owner: Owner) -> OrderResponse:
    order = await get_or_404(
        db, Order, reference.upper(), field="reference", detail="Order not found"
    )
    order = await service.unhide_order(db, order)
    return await _out(db, order)
