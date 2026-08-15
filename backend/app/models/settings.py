"""Shop-wide values the owner can change without a deploy.

One row, always the same id — a singleton, not a lookup table. The
alternative was a hardcoded constant (`frontend/src/lib/contact.ts`, and
before that, four different hardcoded copies of the same email and phone
number in different files). A constant means changing a phone number is a
code change and a deploy; a row the owner edits from the console is a form.

Kept deliberately small: the two fields that were actually hardcoded
(`contact_email`, `contact_phone`). `Settings.whatsapp_number` in
`app/config.py` is a related but separate value — it is env-configured and
used server-side to build `wa.me` links in `notify/service.py`; folding it in
here is real follow-up work (it touches notification copy, not just a
storefront constant), not done in this pass. Add a column here rather than a
new constant the next time a shop-wide value shows up.
"""
from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TimestampMixin

#: The one row this table will ever have.
SETTINGS_ID = "shop"


class ShopSettings(Base, TimestampMixin):
    __tablename__ = "shop_settings"

    id: Mapped[str] = mapped_column(String(8), primary_key=True, default=lambda: SETTINGS_ID)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(30), nullable=False)
