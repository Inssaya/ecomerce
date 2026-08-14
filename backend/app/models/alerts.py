"""Someone wanted a piece that was gone.

Every shop needs this and most do it badly — "notify me" that goes into a list
nobody reads. Here it does two jobs, and the second is the valuable one:

1. It tells the person when we make another.
2. It is the clearest demand signal the workshop gets. A search tells you what
   somebody typed; this tells you what somebody would have paid for, on a
   specific piece, at a price they already saw.

So it feeds `what to make next` alongside custom requests, and it means a
sold-out page stops being a dead end.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import uuid_fk, uuid_pk
from app.models.catalog import Product


class PieceAlert(Base):
    """One person waiting on one piece."""

    __tablename__ = "piece_alerts"
    __table_args__ = (
        # Asking twice is asking once. Nobody should be messaged twice because
        # they tapped the button again a week later.
        UniqueConstraint("product_id", "phone", name="uq_alert_product_phone"),
        Index("ix_alerts_pending", "product_id", "notified_at"),
    )

    id: Mapped[str] = uuid_pk()
    product_id: Mapped[str] = uuid_fk("products.id")
    #: The phone is the identity, as everywhere else — most buyers have no
    #: account and will not make one to be told about a hook.
    phone: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lang: Mapped[str] = mapped_column(String(2), default="en", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    product: Mapped[Product] = relationship()
