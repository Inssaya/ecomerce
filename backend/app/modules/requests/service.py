"""Custom requests: raise, quote, approve, make, deliver.

The one rule this file exists to enforce: **a quote is not an order.** Nothing
is owed until the workshop has priced the work and the customer has said yes to
that price. Approving is what creates the order, and only then does an amount
exist to be collected at the door.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import conflict
from app.core.security import new_order_reference, new_tracking_token
from app.models import Category, Order, OrderEvent, OrderItem, OrderStatus, User
from app.models.requests import CustomRequest, RequestEvent, RequestStatus
from app.modules.notify.service import notify_order_status, notify_request_status
from app.modules.orders.service import delivery_fee_for
from app.modules.requests.schemas import Quote, RequestCreate


async def raise_request(
    db: AsyncSession, body: RequestCreate, customer: User | None
) -> CustomRequest:
    # A category we do not recognise is dropped rather than refused. The
    # picker only ever offers real ones, so this is a stale tab or a bad
    # client — and losing a lead over a dropdown would be the expensive way to
    # be right. The description, which is the part that matters, is untouched.
    category_id = body.category_id or None
    if category_id and not await db.scalar(
        select(Category.id).where(Category.id == category_id, Category.is_active.is_(True))
    ):
        category_id = None

    request = CustomRequest(
        reference=new_order_reference(),
        tracking_token=new_tracking_token(),
        customer_id=customer.id if customer else None,
        customer_name=body.full_name,
        customer_phone=body.phone,
        customer_email=body.email,
        city=body.city,
        lang=body.lang,
        description=body.description,
        category_id=category_id,
        budget=body.budget,
        references=body.references,
        product_id=body.product_id,
        source=body.source,
        events=[RequestEvent(status=RequestStatus.requested, actor="customer")],
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)
    await notify_request_status(request)
    return request


async def quote(db: AsyncSession, request: CustomRequest, body: Quote) -> CustomRequest:
    """Price it and date it.

    Re-quoting is allowed while it is still a quote — the customer asks for a
    change, the number moves. It is not allowed once they have approved one,
    because that would be moving the price after the handshake.
    """
    if not request.can_move_to(RequestStatus.quoted):
        raise conflict(
            f"A request that is '{request.status.value}' cannot be quoted"
        )

    request.quote_price = body.price
    request.lead_time_days = body.lead_time_days
    request.quote_note_en = body.note_en
    request.quote_note_ar = body.note_ar
    # A real date, computed from today, so the page never has to say "soon".
    request.promised_for = date.today() + timedelta(days=body.lead_time_days)
    request.status = RequestStatus.quoted
    db.add(
        RequestEvent(
            request_id=request.id,
            status=RequestStatus.quoted,
            actor="workshop",
            note=f"{body.price:.0f} MAD, {body.lead_time_days} days",
        )
    )
    await db.commit()
    await db.refresh(request)
    await notify_request_status(request)
    return request


async def approve(
    db: AsyncSession, request: CustomRequest, *, address: dict, city: str
) -> CustomRequest:
    """The customer says yes. Only now does an order exist.

    The order is a made-to-order line with no product behind it — there is no
    catalogue entry for a thing that was described in a sentence — so it
    carries the quote as its own line.
    """
    if not request.can_move_to(RequestStatus.approved):
        raise conflict(f"A request that is '{request.status.value}' cannot be approved")
    if request.quote_price is None:
        raise conflict("This request has not been quoted yet")

    price = Decimal(request.quote_price)
    fee = await delivery_fee_for(db, price, city)
    order = Order(
        reference=request.reference,
        tracking_token=new_tracking_token(),
        customer_id=request.customer_id,
        customer_name=request.customer_name,
        customer_phone=request.customer_phone,
        customer_email=request.customer_email,
        lang=request.lang,
        address=address,
        city=city,
        subtotal=price,
        delivery_fee=fee,
        total=price + fee,
        # The date already agreed at quoting time. Without carrying it over,
        # the countdown on the tracking page is empty for exactly the path
        # that needs it most: the buyer of a custom piece has no catalogue
        # entry to reassure them, only this date.
        promised_for=request.promised_for,
        note=request.description[:500],
        # Always one line, and always without a product behind it.
        #
        # This used to be built only `if request.product_id`, which meant it
        # was never built at all: a custom request starts from the customer's
        # own idea, so there is no catalogue row to point at. Every approved
        # request became an order with a total and nothing in it.
        items=[
            OrderItem(
                product_id=None,
                title=request.description[:300],
                unit_price=price,
                quantity=1,
                subtotal=price,
                lead_time_days=request.lead_time_days,
            )
        ],
        events=[OrderEvent(status=OrderStatus.placed, actor="customer")],
    )
    db.add(order)
    await db.flush()

    request.order_id = order.id
    request.status = RequestStatus.approved
    db.add(
        RequestEvent(request_id=request.id, status=RequestStatus.approved, actor="customer")
    )
    await db.commit()
    await db.refresh(request)
    await db.refresh(order)

    await notify_request_status(request)
    await notify_order_status(order)
    return request


async def change_status(
    db: AsyncSession,
    request: CustomRequest,
    target: RequestStatus,
    note: str | None,
    actor: str,
) -> CustomRequest:
    if request.status is target:
        return request
    if not request.can_move_to(target):
        raise conflict(
            f"A request that is '{request.status.value}' cannot become '{target.value}'"
        )

    request.status = target
    db.add(RequestEvent(request_id=request.id, status=target, actor=actor, note=note))
    await db.commit()
    await db.refresh(request)
    await notify_request_status(request)
    return request


async def hide_request(db: AsyncSession, request: CustomRequest) -> CustomRequest:
    """Archive a lead out of the console's default view. Reversible — a
    request that looked like nothing today may not be nothing next month,
    which is the same reasoning contact-message archiving already uses."""
    if request.hidden_at is None:
        request.hidden_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(request)
    return request


async def unhide_request(db: AsyncSession, request: CustomRequest) -> CustomRequest:
    if request.hidden_at is not None:
        request.hidden_at = None
        await db.commit()
        await db.refresh(request)
    return request
