"""Accounts.

Single owner, single workshop: there is no seller role, no marketplace, and no
KYC queue — those tables and their review flow were deleted with the
seller-service, not ported. Verified against the rest of the codebase: `UserRole`
below has only `owner` and `customer`; `models/orders.py`'s own docstring and
`modules/auth/routes.py`'s independently confirm the same removal.

An account is never required to buy. In a cash-on-delivery market the phone
number is the identity that matters; an account only exists for the owner, and
for a customer who wants their order history in one place.

Identity itself lives in Supabase now — it holds the password, sends the
confirmation and reset mail, and signs the tokens. This row is the shop's own
half of the same person: `id` is the Supabase user id, and the row exists
because six tables point at it, so an order can keep pointing at whoever
placed it. `role` stays here rather than in Supabase metadata, because who may
open the console is the shop's decision and not a dashboard setting.
"""
from __future__ import annotations

from enum import Enum as PyEnum

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TimestampMixin, uuid_pk


class UserRole(str, PyEnum):
    owner = "owner"
    customer = "customer"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = uuid_pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
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

    @property
    def is_owner(self) -> bool:
        return self.role is UserRole.owner
