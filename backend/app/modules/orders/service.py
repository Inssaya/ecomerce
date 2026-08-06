"""Placing an order and moving it through its lifecycle.

Two rules the old order-service did not enforce, both of which cost real money
in a cash-on-delivery market:

1. **Prices come from the database.** The old checkout summed `price * qty`
   using the price in the request body, so the amount the courier collected was
   whatever the client posted.
2. **Only legal transitions are accepted.** The old endpoint assigned any
   status over any other, so a delivered order could be moved back to pending
   and re-notified.

Stock is decremented under a row lock, so two people checking out the last
piece at the same moment cannot both get it — the honest scarcity in
BRAND.md §10 only holds if the count is right.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.core.errors import bad_request, conflict
from app.core.security import new_order_reference, new_tracking_token
from app.models import Order, OrderEvent, OrderItem, OrderStatus, Product, ProductStatus, User
from app.modules.catalog.service import primary_image
from app.modules.notify.service import notify_order_status
from app.modules.orders.schemas import CheckoutRequest


def delivery_fee_for(subtotal: Decimal) -> Decimal:
    """Free over the threshold, flat otherwise. Stated on the page before
    checkout — a delivery fee discovered at the door is a refused package."""
    if subtotal >= Decimal(str(settings.free_delivery_over)):
        return Decimal("0")
    return Decimal(str(settings.delivery_fee))


async def place_order(
    db: AsyncSession, body: CheckoutRequest, customer: User | None
) -> Order:
    wanted = {line.product_id: line.quantity for line in body.items}
    if len(wanted) != len(body.items):
        raise bad_request("The same piece appears twice in the cart")

    # FOR UPDATE: hold the rows until this checkout commits, so concurrent
    # checkouts serialize on the stock they are both trying to take.
    products = (
        await db.scalars(
            select(Product)
            .where(Product.id.in_(wanted))
            .options(selectinload(Product.media))
            .with_for_update()
        )
    ).all()

    found = {product.id: product for product in products}
    missing = set(wanted) - set(found)
    if missing:
        raise bad_request("Something in your cart is no longer available")

    subtotal = Decimal("0")
    lines: list[OrderItem] = []
    for product_id, quantity in wanted.items():
        product = found[product_id]
        if product.status is not ProductStatus.active:
            raise conflict(f"'{product.title_en}' is no longer available")
        if product.stock < quantity:
            raise conflict(
                f"We only have {product.stock} of '{product.title_en}' — we made that many"
            )
        product.stock -= quantity

        unit_price = Decimal(product.price)
        line_total = unit_price * quantity
        subtotal += line_total
        lines.append(
            OrderItem(
                product_id=product.id,
                title=product.title(body.lang),
                unit_price=unit_price,
                quantity=quantity,
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
        raise conflict(
            f"An order that is '{order.status.value}' cannot become '{target.value}'"
        )

    # A cancelled or returned order puts its pieces back on the shelf.
    if target in (OrderStatus.cancelled, OrderStatus.returned):
        for line in order.items:
            product = await db.get(Product, line.product_id, with_for_update=True)
            if product is not None:
                product.stock += line.quantity

    order.status = target
    db.add(OrderEvent(order_id=order.id, status=target, actor=actor, note=note))
    await db.commit()
    await db.refresh(order)

    await notify_order_status(db, order)
    return order
