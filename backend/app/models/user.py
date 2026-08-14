"""Accounts.

Single owner, single workshop: there is no seller role, no marketplace, and no
KYC queue — those tables and their review flow were deleted with the
seller-service, not ported.

An account is never required to buy. In a cash-on-delivery market the phone
number is the identity that matters; an account only exists for the owner, and
for a customer who wants their order history in one place.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import TimestampMixin, uuid_fk, uuid_pk


class UserRole(str, PyEnum):
    owner = "owner"
    customer = "customer"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = uuid_pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), default=UserRole.customer, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Preferred language for email and notifications: "en" or "ar".
    lang: Mapped[str] = mapped_column(String(2), default="en", nullable=False)
    #: The customer's own photograph. Null on almost every account — the
    #: storefront falls back to an initial rather than a stock silhouette.
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    #: Where they are, so checkout does not ask a second time.
    #:
    #: An order still copies the address into its own JSON column rather than
    #: pointing at these, and deliberately: an order is a record of what was
    #: agreed on that day, and a customer who moves house must not rewrite where
    #: last month's parcel was sent. These two are the *default* — what the
    #: checkout form arrives already filled in with, and what a correction there
    #: writes back for next time.
    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)

    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def is_owner(self) -> bool:
        return self.role is UserRole.owner


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = uuid_pk()
    user_id: Mapped[str] = uuid_fk("users.id")
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="refresh_tokens")
