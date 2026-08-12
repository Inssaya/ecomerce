"""What the shop noticed, and who it has stopped answering.

Basic, on purpose — the owner asked for logs, not a SIEM. One row per notable
event, and one row per blocked device or address. No cards, no charts: the
console reads this table close to raw.

`SecurityEvent` is written to from wherever something worth knowing happens —
today that is the rate limiter's 429 path (`core/limits.py`). `Blocklist` is
enforced by a middleware in `main.py`, backed by a Redis cache the same way
the rate limiter itself is: fast to check, fails open if Redis is down,
because a security feature that can take the whole shop offline is worse than
the risk it defends against.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import uuid_pk


class SecurityLevel(str, PyEnum):
    info = "info"
    warn = "warn"
    #: Red in the console. Also what triggers the email alert.
    danger = "danger"


class SecurityEvent(Base):
    __tablename__ = "security_events"
    __table_args__ = (
        Index("ix_security_events_recent", "created_at"),
        Index("ix_security_events_level_recent", "level", "created_at"),
    )

    id: Mapped[str] = uuid_pk()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    level: Mapped[SecurityLevel] = mapped_column(
        Enum(SecurityLevel, name="security_level"), nullable=False, index=True
    )
    #: A short machine tag — "rate_limit", "signin_flood" — not a sentence.
    #: The sentence is `message`.
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    visitor_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    #: Whatever else is worth keeping about this one event — the bucket that
    #: tripped, the count it tripped at. Free-form on purpose: a logging call
    #: site should never be blocked on a migration to record one more fact.
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class Blocklist(Base):
    """One row blocks one thing: a fingerprint, or an address.

    They are never merged into one row with two optional columns beyond this
    point — a device block and an IP block have different lifetimes (a
    fingerprint stays blocked until someone lifts it; an IP block expires in
    24 hours, because an address can be a whole café) and a single row cannot
    carry two expiries.
    """

    __tablename__ = "blocklist"
    __table_args__ = (
        CheckConstraint("ip IS NOT NULL OR visitor_id IS NOT NULL", name="ck_blocklist_target"),
        Index("ix_blocklist_ip", "ip"),
        Index("ix_blocklist_visitor", "visitor_id"),
    )

    id: Mapped[str] = uuid_pk()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    visitor_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    #: Null means it does not expire on its own — a fingerprint block. An IP
    #: block always carries one, set 24 hours out at creation.
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
