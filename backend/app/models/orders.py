"""Orders — cash on delivery, MAD, Morocco.

Ported from order-service. Two things changed in the move:

* `seller_id` is gone from the line item. One workshop makes everything, so
  there was nothing to split an order across and no commission to compute.
* `product_id` is a real foreign key with `ondelete=RESTRICT`. Products are
  archived, never deleted, and an order must stay reconstructable for as long
  as it exists — a delivered COD order is an accounting record.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import TimestampMixin, uuid_fk, uuid_pk


class OrderStatus(str, PyEnum):
    placed = "placed"
    confirmed = "confirmed"
    preparing = "preparing"
    ready = "ready"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    cancelled = "cancelled"
    failed = "failed"
    returned = "returned"


#: The only transitions the order lifecycle permits (REBUILD-PLAN §6).
#: The old service accepted any status from any status, which meant a delivered
#: order could silently go back to `placed`.
ALLOWED_TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.placed: frozenset({OrderStatus.confirmed, OrderStatus.cancelled}),
    OrderStatus.confirmed: frozenset({OrderStatus.preparing, OrderStatus.cancelled}),
    OrderStatus.preparing: frozenset({OrderStatus.ready, OrderStatus.cancelled}),
    OrderStatus.ready: frozenset({OrderStatus.out_for_delivery, OrderStatus.cancelled}),
    OrderStatus.out_for_delivery: frozenset({OrderStatus.delivered, OrderStatus.failed}),
    OrderStatus.delivered: frozenset(),
    OrderStatus.failed: frozenset({OrderStatus.returned, OrderStatus.out_for_delivery}),
    OrderStatus.cancelled: frozenset(),
    OrderStatus.returned: frozenset(),
}

#: Statuses from which no further movement is possible.
TERMINAL_STATUSES = frozenset(
    status for status, nexts in ALLOWED_TRANSITIONS.items() if not nexts
)


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[str] = uuid_pk()
    reference: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    tracking_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    # Optional: buying never requires an account.
    customer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lang: Mapped[str] = mapped_column(String(2), default="en", nullable=False)

    address: Mapped[dict] = mapped_column(JSONB, nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False, index=True)

    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    delivery_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), default=OrderStatus.placed, nullable=False, index=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )
    events: Mapped[list[OrderEvent]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderEvent.created_at",
        lazy="selectin",
    )

    def can_move_to(self, target: OrderStatus) -> bool:
        return target in ALLOWED_TRANSITIONS[self.status]


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = uuid_pk()
    order_id: Mapped[str] = uuid_fk("orders.id")
    product_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Snapshot of what was bought, at the price it was bought for. The product
    # may be renamed or repriced later; the order may not change.
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    order: Mapped[Order] = relationship(back_populates="items")


class OrderEvent(Base):
    """One row per state change — the order's history, and what the customer's
    tracking page is built from."""

    __tablename__ = "order_events"

    id: Mapped[str] = uuid_pk()
    order_id: Mapped[str] = uuid_fk("orders.id")
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, name="order_status"), nullable=False)
    actor: Mapped[str] = mapped_column(String(30), default="system", nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    order: Mapped[Order] = relationship(back_populates="events")
