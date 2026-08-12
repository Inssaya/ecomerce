"""Placing an order and moving it through its lifecycle.

Two rules the old order-service did not enforce, both of which cost real money
in a cash-on-delivery market:

1. **Prices come from the database.** The old checkout summed `price * qty`
   using the price in the request body, so the amount the courier collected was
   whatever the client posted.
2. **Only legal transitions are accepted.** The old endpoint assigned any
   status over any other, so a delivered order could be moved back to pending
   and re-notified.

Buying a shelf piece **reserves specific pieces**, taken under a row lock and
lowest-numbered first. That is what makes the count on the page true: two
people checking out the last piece at the same moment cannot both get it,
because there is one row and only one of them can lock it. Made-to-order lines
reserve nothing — there is nothing yet to reserve, only a promise about when.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.errors import bad_request, conflict
from app.core.security import new_order_reference, new_tracking_token
from app.models import (
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
    Piece,
    PieceState,
    Product,
    ProductStatus,
    ProductVariant,
    User,
)
from app.modules.catalog.service import primary_image
from app.modules.local import service as local
from app.modules.notify.service import notify_order_status
from app.modules.orders.schemas import CheckoutRequest

logger = logging.getLogger(__name__)

#: Pieces move with the order they belong to.
PIECE_STATE_FOR_ORDER: dict[OrderStatus, PieceState] = {
    OrderStatus.delivered: PieceState.sold,
    OrderStatus.cancelled: PieceState.available,
    OrderStatus.returned: PieceState.available,
}


#: How long an unconfirmed order may hold real objects. Cash on delivery has
#: no payment step to abandon, so nothing else ever releases them.
RESERVATION_HOURS = 48


async def release_stale_reservations(db: AsyncSession) -> int:
    """Give back the pieces held by orders nobody ever confirmed.

    This closes a genuine hole rather than adding a feature. A shelf piece is
    reserved the moment an order is placed, and an order that is never
    confirmed used to hold it forever — so a handful of abandoned checkouts
    would show the shop as sold out while nothing had been sold. There is no
    payment step here to time out, so this is the only thing that frees them.

    Runs on the way into checkout: one indexed query, and it means the sweep
    happens without a scheduler to forget to deploy.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=RESERVATION_HOURS)
    stale = list(
        await db.scalars(
            select(Order)
            .where(Order.status == OrderStatus.placed, Order.created_at < cutoff)
            .limit(50)
        )
    )
    for order in stale:
        await change_status(
            db,
            order,
            OrderStatus.cancelled,
            f"Not confirmed within {RESERVATION_HOURS} hours",
            actor="system",
        )
    if stale:
        logger.info("Released the pieces held by %s unconfirmed orders", len(stale))
    return len(stale)


async def delivery_fee_for(db: AsyncSession, subtotal: Decimal, city: str | None) -> Decimal:
    """Free over the threshold; otherwise what that city costs to reach.

    Stated on the page before checkout — a delivery fee discovered at the door
    is a refused package, and a refused package is the most expensive thing
    that happens in this market. Which is why the city matters: the City model
    carries an override "where a city genuinely costs more to reach", the city
    page has always published it, and this used to charge the flat setting
    regardless. Two numbers for one delivery, and the one the customer read was
    not the one they were asked for.
    """
    if subtotal >= Decimal(str(settings.free_delivery_over)):
        return Decimal("0")
    return Decimal(str(await local.fee_for_name(db, city)))


async def place_order(db: AsyncSession, body: CheckoutRequest, customer: User | None) -> Order:
    """Take the order. Nothing is reserved, because nothing is finite.

    This used to lock and reserve `Piece` rows for anything filed as `shelf`,
    and refuse the line when there were not enough — "we have 2 of this, we
    made that many". The shop is made-to-order throughout: what is ordered
    gets made. So an order can never be short, and no row is taken off
    anything.

    `release_stale_reservations` still runs, for orders placed before this
    changed that are still holding pieces. It is a no-op once they are done.
    """
    await release_stale_reservations(db)

    seen = {(line.product_id, line.variant_id) for line in body.items}
    if len(seen) != len(body.items):
        raise bad_request("The same piece appears twice in the cart")

    subtotal = Decimal("0")
    lines: list[OrderItem] = []

    for line in body.items:
        product = await db.scalar(
            select(Product)
            .where(Product.id == line.product_id)
            .options(selectinload(Product.media))
        )
        if product is None or product.status is not ProductStatus.active:
            raise conflict("Something in your cart is no longer available")

        variant: ProductVariant | None = None
        if line.variant_id:
            variant = await db.scalar(
                select(ProductVariant).where(
                    ProductVariant.id == line.variant_id,
                    ProductVariant.product_id == product.id,
                    ProductVariant.is_active.is_(True),
                )
            )
            if variant is None:
                raise conflict("That option is no longer available")

        unit_price = Decimal(variant.price if variant and variant.price is not None else product.price)

        # One line per product, whatever the quantity. There is no longer a
        # branch that splits a line into one row per physical object, because
        # there are no physical objects to point at until it is made.
        line_total = unit_price * line.quantity
        subtotal += line_total
        lines.append(
            OrderItem(
                product_id=product.id,
                variant_id=variant.id if variant else None,
                piece_id=None,
                title=product.title(body.lang),
                variant_label=variant.option(body.lang) if variant else "",
                # What we promised, on the day we promised it. `delivery_days`
                # is the field the console edits; `lead_time_days` is what old
                # rows carry.
                lead_time_days=product.delivery_days or product.lead_time_days,
                unit_price=unit_price,
                quantity=line.quantity,
                subtotal=line_total,
                image_url=primary_image(product),
            )
        )

    fee = await delivery_fee_for(db, subtotal, body.address.city)
    order = Order(
        reference=new_order_reference(),
        tracking_token=new_tracking_token(),
        customer_id=customer.id if customer else None,
        customer_name=body.full_name,
        customer_phone=body.phone,
        customer_email=body.email,
        lang=body.lang,
        address=body.address.model_dump(),
        city=body.address.city,
        subtotal=subtotal,
        delivery_fee=fee,
        total=subtotal + fee,
        items=lines,
        events=[OrderEvent(status=OrderStatus.placed, actor="customer")],
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    await notify_order_status(order)
    return order


async def change_status(
    db: AsyncSession, order: Order, target: OrderStatus, note: str | None, actor: str
) -> Order:
    if order.status is target:
        return order
    if not order.can_move_to(target):
        raise conflict(f"An order that is '{order.status.value}' cannot become '{target.value}'")

    piece_state = PIECE_STATE_FOR_ORDER.get(target)
    if piece_state is not None:
        # A cancelled or returned order puts its pieces back on the shelf; a
        # delivered one marks them sold. Either way the count on the page
        # follows the objects, not a number someone remembered to update.
        piece_ids = [item.piece_id for item in order.items if item.piece_id]
        if piece_ids:
            for piece in await db.scalars(
                select(Piece).where(Piece.id.in_(piece_ids)).with_for_update()
            ):
                piece.state = piece_state

    order.status = target
    db.add(OrderEvent(order_id=order.id, status=target, actor=actor, note=note))
    await db.commit()
    await db.refresh(order)

    await notify_order_status(order)
    return order
