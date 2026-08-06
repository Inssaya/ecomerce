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
    ProductKind,
    ProductStatus,
    ProductVariant,
    User,
)
from app.modules.catalog.service import primary_image
from app.modules.notify.service import notify_order_status
from app.modules.orders.schemas import CartLine, CheckoutRequest

#: Pieces move with the order they belong to.
PIECE_STATE_FOR_ORDER: dict[OrderStatus, PieceState] = {
    OrderStatus.delivered: PieceState.sold,
    OrderStatus.cancelled: PieceState.available,
    OrderStatus.returned: PieceState.available,
}


def delivery_fee_for(subtotal: Decimal) -> Decimal:
    """Free over the threshold, flat otherwise. Stated on the page before
    checkout — a delivery fee discovered at the door is a refused package."""
    if subtotal >= Decimal(str(settings.free_delivery_over)):
        return Decimal("0")
    return Decimal(str(settings.delivery_fee))


async def _take_pieces(
    db: AsyncSession, product: Product, line: CartLine
) -> list[Piece]:
    """Lock and reserve the pieces this line is buying."""
    query = (
        select(Piece)
        .where(Piece.product_id == product.id, Piece.state == PieceState.available)
        .order_by(Piece.number)
        .limit(line.quantity)
        .with_for_update()
    )
    if line.variant_id:
        query = query.where(Piece.variant_id == line.variant_id)

    pieces = list(await db.scalars(query))
    if len(pieces) < line.quantity:
        raise conflict(
            f"We have {len(pieces)} of '{product.title_en}' — we made that many"
        )
    for piece in pieces:
        piece.state = PieceState.reserved
    return pieces


async def place_order(db: AsyncSession, body: CheckoutRequest, customer: User | None) -> Order:
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

        if product.kind is ProductKind.shelf:
            pieces = await _take_pieces(db, product, line)
            # One line per physical object: the customer is buying piece 04 of
            # 12, not "one of them".
            for piece in pieces:
                subtotal += unit_price
                lines.append(
                    OrderItem(
                        product_id=product.id,
                        variant_id=variant.id if variant else None,
                        piece_id=piece.id,
                        title=product.title(body.lang),
                        variant_label=variant.option(body.lang) if variant else "",
                        piece_label=piece.label if product.show_piece_numbers else "",
                        unit_price=unit_price,
                        quantity=1,
                        subtotal=unit_price,
                        image_url=piece.photo_url or primary_image(product),
                    )
                )
        else:
            line_total = unit_price * line.quantity
            subtotal += line_total
            lines.append(
                OrderItem(
                    product_id=product.id,
                    variant_id=variant.id if variant else None,
                    piece_id=None,
                    title=product.title(body.lang),
                    variant_label=variant.option(body.lang) if variant else "",
                    # What we promised, on the day we promised it.
                    lead_time_days=product.lead_time_days,
                    unit_price=unit_price,
                    quantity=line.quantity,
                    subtotal=line_total,
                    image_url=primary_image(product),
                )
            )

    fee = delivery_fee_for(subtotal)
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

    await notify_order_status(db, order)
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

    await notify_order_status(db, order)
    return order
