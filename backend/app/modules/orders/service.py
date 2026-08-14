"""Placing an order and moving it through its lifecycle.

Two rules the old order-service did not enforce, both of which cost real money
in a cash-on-delivery market:

1. **Prices come from the database.** The old checkout summed `price * qty`
   using the price in the request body, so the amount the courier collected was
   whatever the client posted.
2. **Only legal transitions are accepted.** The old endpoint assigned any
   status over any other, so a delivered order could be moved back to pending
   and re-notified.

**Nothing is reserved, and nothing expires.** This shop does not count units,
so checkout takes no row off anything and an order can never be short. The
48-hour sweep that used to cancel any order still `placed` is gone with it: it
had no pieces left to free, it ran on every checkout, and it mailed the buyer
"your order is cancelled" for the sole offence of the workshop not having rung
them back yet. Confirming is a phone call, and a phone call has no deadline.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
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

#: Pieces move with the order they belong to.
PIECE_STATE_FOR_ORDER: dict[OrderStatus, PieceState] = {
    OrderStatus.delivered: PieceState.sold,
    OrderStatus.cancelled: PieceState.available,
    OrderStatus.returned: PieceState.available,
}


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


async def place_order(
    db: AsyncSession,
    body: CheckoutRequest,
    customer: User | None,
    visitor_id: str | None,
) -> Order:
    """Take the order. Nothing is reserved, because nothing is finite.

    This used to lock and reserve `Piece` rows for anything filed as `shelf`,
    and refuse the line when there were not enough. The shop does not count
    units — an order can never be short, and no row is taken off anything.

    What is new here: the buyer's *choices* travel with the order. Their
    fingerprint lands on `Order.visitor_id` (the join key that lets a customer
    bucket collect their hearts and saves), the attributes they picked are
    frozen as JSON on each line, and their name — capped at 20 characters —
    goes on the line the workshop actually reads. The personalization markup
    is applied here on the server, from `Product.personalization_markup_pct`,
    so a client that lies about the markup still gets billed correctly.
    """
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

        # Discount is applied by the server (see `Product.effective_price`),
        # so a variant override still wins when it is set — that is how the
        # catalogue has always worked — but the base price is the reduced one.
        base_price = variant.price if variant and variant.price is not None else product.effective_price()
        unit_price = Decimal(str(base_price))

        # Personalization: only if the piece allows it, and only if the buyer
        # actually typed something. The markup is applied here rather than on
        # the client so a rewritten checkout body still pays the right price.
        personalization = (line.personalization or "").strip() or None
        if personalization and not product.personalizable:
            raise conflict(f"'{product.title_en}' cannot be personalised")
        if personalization:
            markup = Decimal(str(product.personalization_markup_pct or 0))
            unit_price = (unit_price * (Decimal("100") + markup) / Decimal("100")).quantize(Decimal("0.01"))

        line_total = unit_price * line.quantity
        subtotal += line_total

        # Snapshot of what they picked, so a typo corrected on a colour next
        # month never rewrites this row. Empty list stored as null so the
        # column reads honestly.
        selection = [item.model_dump() for item in line.selection] or None

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
                selection=selection,
                personalization=personalization,
            )
        )

    fee = await delivery_fee_for(db, subtotal, body.address.city)

    # The date the countdown counts to, defaulted from the slowest promise on
    # the order — a mixed cart is only as fast as its slowest line. Left null
    # when nothing on the order carries a promise at all, rather than
    # inventing one.
    promises = [item.lead_time_days for item in lines if item.lead_time_days]
    promised_for = (
        (datetime.now(UTC).date() + timedelta(days=max(promises))) if promises else None
    )

    order = Order(
        reference=new_order_reference(),
        tracking_token=new_tracking_token(),
        customer_id=customer.id if customer else None,
        customer_name=body.full_name,
        customer_phone=body.phone,
        customer_email=body.email,
        visitor_id=visitor_id,
        lang=body.lang,
        address=body.address.model_dump(),
        city=body.address.city,
        subtotal=subtotal,
        delivery_fee=fee,
        total=subtotal + fee,
        promised_for=promised_for,
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


async def set_promise(db: AsyncSession, order: Order, promised_for: date) -> Order:
    """Move the date the countdown counts to.

    A promise made on the day the order was placed sometimes has to move —
    a supplier is late, a piece takes longer than expected — and the number
    on the customer's tracking page should always be the one that is still
    true, not the one that was true on day one.
    """
    order.promised_for = promised_for
    await db.commit()
    await db.refresh(order)
    return order


async def hide_order(db: AsyncSession, order: Order) -> Order:
    """Archive it out of the console's default view. Reversible, and never
    read by anything the customer can see — see `Order.hidden_at`."""
    if order.hidden_at is None:
        order.hidden_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(order)
    return order


async def unhide_order(db: AsyncSession, order: Order) -> Order:
    if order.hidden_at is not None:
        order.hidden_at = None
        await db.commit()
        await db.refresh(order)
    return order


async def item_categories(db: AsyncSession, orders: list[Order]) -> dict[str, tuple[str | None, str | None]]:
    """Category · sub-category for every line item across a page of orders,
    resolved in one query rather than one per item.

    Reuses `catalog.service.category_names` so an order line and the product
    admin table describe a category the same way. Returns an empty pair for a
    product that has since been archived or deleted — the order still has to
    read, it just cannot say what it no longer knows.
    """
    from app.models import Category
    from app.modules.catalog import service as catalog_service

    product_ids = {item.product_id for order in orders for item in order.items}
    if not product_ids:
        return {}
    rows = await db.scalars(
        select(Product)
        .where(Product.id.in_(product_ids))
        .options(selectinload(Product.category).selectinload(Category.parent))
    )
    return {product.id: catalog_service.category_names(product) for product in rows.unique()}
