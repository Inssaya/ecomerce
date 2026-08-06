"""Custom requests — the standout feature.

"If we cannot find it, we make it." (BRAND.md §3.) A request turns a dead end
into a lead: the visitor wanted something, we did not have it, and instead of
losing them we have their description and their phone number.

It is deliberately *not* an order. Nothing is owed until the workshop has
quoted a price and the customer has said yes to it — a made-to-order piece
whose price nobody agreed on is exactly the surprise at the door that COD
punishes.
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum as PyEnum

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import TimestampMixin, uuid_fk, uuid_pk


class RequestStatus(str, PyEnum):
    requested = "requested"
    quoted = "quoted"
    approved = "approved"
    in_production = "in_production"
    ready = "ready"
    delivered = "delivered"
    declined = "declined"  # by us: we cannot make it
    withdrawn = "withdrawn"  # by them: they changed their mind or refused the quote


#: The lifecycle. Same shape as the order state machine and enforced the same
#: way, because "any status from any status" was a real bug in the old code.
REQUEST_TRANSITIONS: dict[RequestStatus, frozenset[RequestStatus]] = {
    RequestStatus.requested: frozenset(
        {RequestStatus.quoted, RequestStatus.declined, RequestStatus.withdrawn}
    ),
    RequestStatus.quoted: frozenset(
        {RequestStatus.approved, RequestStatus.withdrawn, RequestStatus.quoted}
    ),
    RequestStatus.approved: frozenset({RequestStatus.in_production, RequestStatus.withdrawn}),
    RequestStatus.in_production: frozenset({RequestStatus.ready, RequestStatus.withdrawn}),
    RequestStatus.ready: frozenset({RequestStatus.delivered, RequestStatus.withdrawn}),
    RequestStatus.delivered: frozenset(),
    RequestStatus.declined: frozenset(),
    RequestStatus.withdrawn: frozenset(),
}


class CustomRequest(Base, TimestampMixin):
    __tablename__ = "custom_requests"

    id: Mapped[str] = uuid_pk()
    reference: Mapped[str] = mapped_column(String(12), unique=True, index=True, nullable=False)
    tracking_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    customer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lang: Mapped[str] = mapped_column(String(2), default="en", nullable=False)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)

    #: In the customer's own words. This is the most valuable column in the
    #: table — read together, these say what the workshop should make next.
    description: Mapped[str] = mapped_column(Text, nullable=False)
    #: What they expect to spend, if they said. Not a commitment either way.
    budget: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    #: Reference images they uploaded.
    references: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    #: What kind of thing it is, chosen by the customer from the same tree the
    #: shop is organised by.
    #:
    #: Free text is the truest record of what somebody wants and the worst
    #: possible input to a forecast — twenty people can ask for the same thing
    #: in twenty wordings, and the workshop sees twenty unrelated requests. One
    #: tap turns that into "eleven people asked for a lamp this month", which
    #: is a number that can be counted, ranked against what is already on the
    #: shelf, and acted on. The description stays; this sits beside it.
    category_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: Where it came from: the assistant, the form, a product page.
    source: Mapped[str] = mapped_column(String(40), default="form", nullable=False)
    #: Set when the assistant raised it, so a conversation can be found again.
    product_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status"),
        default=RequestStatus.requested,
        nullable=False,
        index=True,
    )

    # ── the quote ──
    quote_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    quote_note_en: Mapped[str] = mapped_column(Text, default="", nullable=False)
    quote_note_ar: Mapped[str] = mapped_column(Text, default="", nullable=False)
    #: A real number of days, decided when quoting. Never "soon".
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    promised_for: Mapped[date | None] = mapped_column(Date, nullable=True)

    #: The order raised once the customer approves the quote.
    order_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )

    events: Mapped[list[RequestEvent]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="RequestEvent.created_at",
        lazy="selectin",
    )

    def can_move_to(self, target: RequestStatus) -> bool:
        return target in REQUEST_TRANSITIONS[self.status]


class RequestEvent(Base):
    __tablename__ = "request_events"

    id: Mapped[str] = uuid_pk()
    request_id: Mapped[str] = uuid_fk("custom_requests.id")
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status"), nullable=False
    )
    actor: Mapped[str] = mapped_column(String(30), default="system", nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    request: Mapped[CustomRequest] = relationship(back_populates="events")
