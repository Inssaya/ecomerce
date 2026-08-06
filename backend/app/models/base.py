"""Column primitives every model reuses.

Each of the eight services used to re-declare the same uuid primary key and the
same pair of timestamp columns by hand, in every model file. They are declared
once here; a model that needs them inherits them.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, declarative_mixin, mapped_column
from sqlalchemy.sql import func


def new_id() -> str:
    return str(uuid.uuid4())


def uuid_pk() -> Mapped[str]:
    """Primary key column. Stored as a native Postgres uuid, handled as a str
    in Python so it serializes straight to JSON."""
    return mapped_column(UUID(as_uuid=False), primary_key=True, default=new_id)


def uuid_fk(target: str, *, ondelete: str = "CASCADE", nullable: bool = False, index: bool = True):
    return mapped_column(
        UUID(as_uuid=False),
        ForeignKey(target, ondelete=ondelete),
        nullable=nullable,
        index=index,
    )


@declarative_mixin
class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


@declarative_mixin
class BilingualMixin:
    """English and Arabic are both authored, never generated from one another.

    BRAND.md §9: Arabic is written as Arabic, not as a translation of English
    word order. Storing one text column and translating it at render time is
    exactly the shortcut that produces the machine-translated copy the resale
    market is full of — so both languages are columns, and the Arabic one is
    written by the workshop.
    """

    title_en: Mapped[str] = mapped_column(String(300), nullable=False)
    title_ar: Mapped[str] = mapped_column(String(300), nullable=False, default="")

    def title(self, lang: str) -> str:
        return (self.title_ar or self.title_en) if lang == "ar" else self.title_en
