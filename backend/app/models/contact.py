"""A message from someone who is not ordering yet.

The contact form used to only open a `mailto:`/WhatsApp link in the visitor's
own client — if they didn't follow through, the workshop never knew the
message existed. This table is what makes a message durable: it always lands
somewhere the owner will see it, whether or not the visitor's mail client or
WhatsApp session was actually open.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import uuid_pk


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id: Mapped[str] = uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
