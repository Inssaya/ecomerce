"""What the workshop makes.

Ported from catalog-service with the marketplace scaffolding removed: there is
no `seller_id` (one workshop makes everything) and no `store_id` (the four
subdomain storefronts are gone — REBUILD-PLAN §1: static separation was the
wrong answer to choice paralysis).

`category_id` is a real foreign key now. Under the old split databases it was a
bare string that nothing enforced.
"""
from __future__ import annotations

from enum import Enum as PyEnum

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.base import BilingualMixin, TimestampMixin, uuid_fk, uuid_pk


class ProductStatus(str, PyEnum):
    draft = "draft"
    active = "active"
    paused = "paused"
    archived = "archived"


class Category(Base, TimestampMixin):
    """Self-referencing tree: Clothing → T-Shirts → Oversize."""

    __tablename__ = "categories"

    id: Mapped[str] = uuid_pk()
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    parent: Mapped[Category | None] = relationship(
        remote_side="Category.id", back_populates="children"
    )
    children: Mapped[list[Category]] = relationship(
        back_populates="parent", order_by="Category.display_order"
    )
    products: Mapped[list[Product]] = relationship(back_populates="category")

    def name(self, lang: str) -> str:
        return (self.name_ar or self.name_en) if lang == "ar" else self.name_en


class Product(Base, TimestampMixin, BilingualMixin):
    __tablename__ = "products"

    id: Mapped[str] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    category_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )

    description_en: Mapped[str] = mapped_column(Text, default="", nullable=False)
    description_ar: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # Money is Numeric, never float: MAD totals are collected in cash at the
    # door and have to reconcile to the dirham.
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # How many exist right now. For pieces already made this is a fact, not a
    # marketing number — BRAND.md §10 forbids invented scarcity. Phase 1
    # derives it from the individual pieces on the shelf.
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[ProductStatus] = mapped_column(
        Enum(ProductStatus, name="product_status"),
        default=ProductStatus.draft,
        nullable=False,
        index=True,
    )

    category: Mapped[Category | None] = relationship(back_populates="products")
    media: Mapped[list[ProductMedia]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductMedia.sort_order",
    )

    def description(self, lang: str) -> str:
        return (self.description_ar or self.description_en) if lang == "ar" else self.description_en


class ProductMedia(Base):
    """A photograph of the actual piece.

    BRAND.md §10: never a stock photo, never a supplier image. Nothing in the
    schema can enforce that a file is genuine, but §8's real-photo rule is why
    media is required before a product may leave `draft` (see catalog service).
    """

    __tablename__ = "product_media"

    id: Mapped[str] = uuid_pk()
    product_id: Mapped[str] = uuid_fk("products.id")
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    alt_en: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    alt_ar: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    product: Mapped[Product] = relationship(back_populates="media")
