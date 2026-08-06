"""In-app notifications.

Ported from notification-service. The RabbitMQ consumer that used to fill this
table is gone: the order module calls the notify module directly, in the same
transaction, in the same process.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import uuid_fk, uuid_pk
from app.models.user import User


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str] = uuid_fk("users.id")
    kind: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    user: Mapped[User] = relationship()
