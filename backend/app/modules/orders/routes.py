"""Checkout, tracking and the owner's order list.

Cash on delivery is the only payment method, so there is no payment step: an
order is placed, then it is made, then someone hands it over and takes the
cash.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.errors import get_or_404
from app.core.limits import CheckoutLimit, LookupLimit
from app.deps import CurrentUser, DbSession, OptionalUser, Owner, Paging
from app.models import Order, OrderStatus
from app.modules.notify.service import whatsapp_url
from app.modules.orders import service
from app.modules.orders.schemas import (
    CheckoutRequest,
    FindOrder,
    OrderResponse,
    StatusChange,
)

router = APIRouter(tags=["orders"])


def _out(order: Order) -> OrderResponse:
    response = OrderResponse.model_validate(order)
    response.whatsapp_url = whatsapp_url(order)
    return response


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def checkout(
    body: CheckoutRequest, db: DbSession, user: OptionalUser, _: CheckoutLimit
) -> OrderResponse:
    """No account required. In a market where trust is the scarce thing, an
    account gate before the first purchase is a lost purchase."""
    order = await service.place_order(db, body, user)
    return _out(order)


@router.get("/orders/track/{tracking_token}", response_model=OrderResponse)
async def track(tracking_token: str, db: DbSession) -> OrderResponse:
    """The link sent to the customer. The token is the credential — it is long
    and random precisely so this page needs no login."""
    order = await get_or_404(
        db, Order, tracking_token, field="tracking_token", detail="We can't find that order"
    )
    return _out(order)


@router.post("/orders/find", response_model=OrderResponse)
async def find_order(body: FindOrder, db: DbSession, _: LookupLimit) -> OrderResponse:
    """Find an order from the reference and the phone number.

    People lose the tracking link. They close the tab, they clear WhatsApp,
    they ordered from a friend's phone — and then the only way back in was a
    link they no longer have. Every shop needs this, and a shop where the
    customer is waiting for a courier to knock needs it more than most.

    Both must match. The reference alone is short enough to be guessed at
    eventually; the reference *and* the number belonging to it is not, and this
    endpoint is rate-limited on top.
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
    return _out(order)


@router.get("/orders/mine", response_model=list[OrderResponse])
async def my_orders(user: CurrentUser, db: DbSession, paging: Paging) -> list[OrderResponse]:
    rows = await db.scalars(
        select(Order)
        .where(Order.customer_id == user.id)
        .order_by(Order.created_at.desc())
        .offset(paging.offset)
        .limit(paging.size)
    )
    return [_out(order) for order in rows.unique()]


# ── Owner ─────────────────────────────────────────────────────────────────────


@router.get("/admin/orders", response_model=list[OrderResponse])
async def list_orders(
    db: DbSession,
    owner: Owner,
    paging: Paging,
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, min_length=2, max_length=60),
) -> list[OrderResponse]:
    query = select(Order)
    if status_filter is not None:
        query = query.where(Order.status == status_filter)
    if q:
        term = f"%{q.strip()}%"
        query = query.where(
            Order.reference.ilike(term)
            | Order.customer_phone.ilike(term)
            | Order.customer_name.ilike(term)
        )
    rows = await db.scalars(
        query.order_by(Order.created_at.desc()).offset(paging.offset).limit(paging.size)
    )
    return [_out(order) for order in rows.unique()]


@router.get("/admin/orders/{reference}", response_model=OrderResponse)
async def get_order(reference: str, db: DbSession, owner: Owner) -> OrderResponse:
    order = await get_or_404(
        db, Order, reference.upper(), field="reference", detail="Order not found"
    )
    return _out(order)


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
    return _out(order)


@router.get("/admin/orders/stats/today")
async def today_stats(db: DbSession, owner: Owner) -> dict:
    today = func.date_trunc("day", func.now())
    placed_today = await db.scalar(
        select(func.count()).select_from(Order).where(Order.created_at >= today)
    )
    revenue = await db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(Order.status == OrderStatus.delivered)
    )
    open_orders = await db.scalar(
        select(func.count())
        .select_from(Order)
        .where(Order.status.notin_([OrderStatus.delivered, OrderStatus.cancelled, OrderStatus.returned]))
    )
    return {
        "orders_today": placed_today or 0,
        "open_orders": open_orders or 0,
        "revenue_collected": float(revenue or 0),
        "currency": "MAD",
    }
