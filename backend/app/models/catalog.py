"""What the workshop makes.

Two offers, one table. `kind` says which:

* **shelf** — already made. Finite by nature: we made four, there are four. It
  has `pieces`, one row per physical object, and availability is a count of
  them.
* **workshop** — made to order. Nothing to run out of, so no pieces. What it
  has instead is a promise about time.

An earlier draft of this file split the two into subclass tables with joined
inheritance. That bought type-safety on six columns and cost three tables, a
polymorphic mapper and a join on every read. The buyer cannot tell the
difference; the validation lives in the write schema instead.

There is no facet/filter system here either, and that is deliberate. Filters
exist to help someone narrow ten thousand items. This catalogue is short on
purpose (BRAND.md §7 — In-N-Out), and the whole premise of the rebuild is that
**the store narrows itself around the visitor** rather than handing them a
sidebar of checkboxes. Filters would be the lazy version of the feed.
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum as PyEnum

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import BilingualMixin, TimestampMixin, uuid_fk, uuid_pk

#: Dimension of the product embeddings — text-embedding-3-small, the model the
#: AI phases use. Changing it needs a migration and a re-embed.
EMBEDDING_DIMENSIONS = 1536


class ProductKind(str, PyEnum):
    shelf = "shelf"
    workshop = "workshop"


class ProductStatus(str, PyEnum):
    draft = "draft"
    active = "active"
    paused = "paused"
    archived = "archived"


class PieceState(str, PyEnum):
    """Where one physical object is."""

    available = "available"
    reserved = "reserved"  # in someone's open order
    sold = "sold"
    kept = "kept"  # not for sale: a sample, a second, a gift


class Category(Base, TimestampMixin):
    """Self-referencing tree: T-Shirts → Oversize, Slim.

    Two jobs. It is the navigation, and it is the unit the feed measures
    interest in — a visitor who keeps opening Oversize should see more
    Oversize.
    """

    __tablename__ = "categories"

    id: Mapped[str] = uuid_pk()
    parent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
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
    __table_args__ = (
        # A made-to-order piece without a lead time has nothing honest to put
        # on the page. BRAND.md §8: "ready in six days", never "soon".
        CheckConstraint(
            "kind <> 'workshop' OR lead_time_days IS NOT NULL",
            name="ck_workshop_has_lead_time",
        ),
    )

    id: Mapped[str] = uuid_pk()
    kind: Mapped[ProductKind] = mapped_column(
        Enum(ProductKind, name="product_kind"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    category_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    description_en: Mapped[str] = mapped_column(Text, default="", nullable=False)
    description_ar: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # How it was made, not what it weighs — BRAND.md §7 (Patagonia). This is
    # the paragraph a reseller cannot write about their own listing.
    story_en: Mapped[str] = mapped_column(Text, default="", nullable=False)
    story_ar: Mapped[str] = mapped_column(Text, default="", nullable=False)

    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[ProductStatus] = mapped_column(
        Enum(ProductStatus, name="product_status"),
        default=ProductStatus.draft,
        nullable=False,
        index=True,
    )

    # ── shelf only ──
    made_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Closed means we do not intend to make more. What is left is all there
    # will ever be — and that is the only kind of scarcity we state.
    batch_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Whether to show piece numbers on the page. A hand-finished object earns
    # "Piece 04 of 12"; a batch of fifty brackets does not. Pieces are still
    # rows either way — this only decides whether we say so.
    show_piece_numbers: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # ── workshop only ──
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # An upper bound when the work varies with what is asked for: "from 180 MAD".
    price_max: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    # The owner's thumb on the scale, read by the feed (REBUILD-PLAN §3.3):
    # push a piece worth making more of, bury one that is not. 1.0 is neutral.
    business_boost: Mapped[float] = mapped_column(Numeric(4, 2), default=1, nullable=False)

    category: Mapped[Category | None] = relationship(back_populates="products")
    media: Mapped[list[ProductMedia]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductMedia.sort_order",
    )
    variants: Mapped[list[ProductVariant]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="ProductVariant.display_order",
    )
    pieces: Mapped[list[Piece]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="Piece.number"
    )
    embedding: Mapped[ProductEmbedding | None] = relationship(
        back_populates="product", cascade="all, delete-orphan", uselist=False
    )

    @property
    def is_shelf(self) -> bool:
        return self.kind is ProductKind.shelf

    def description(self, lang: str) -> str:
        return (self.description_ar or self.description_en) if lang == "ar" else self.description_en

    def story(self, lang: str) -> str:
        return (self.story_ar or self.story_en) if lang == "ar" else self.story_en


class ProductVariant(Base):
    """One buyable configuration: size M, matte black.

    The option is a pair of strings rather than a join through a facet
    taxonomy. A t-shirt genuinely needs a size, so variants are real; a
    normalised attribute system to filter thirty items is not.

    Stock is not a column. For a shelf piece it is a count of the pieces that
    exist; a made-to-order piece has none.
    """

    __tablename__ = "product_variants"

    id: Mapped[str] = uuid_pk()
    product_id: Mapped[str] = uuid_fk("products.id")
    sku: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    option_en: Mapped[str] = mapped_column(String(160), nullable=False)
    option_ar: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    # Null means "same as the product" — most pieces have one price.
    price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    product: Mapped[Product] = relationship(back_populates="variants")
    pieces: Mapped[list[Piece]] = relationship(back_populates="variant")

    def option(self, lang: str) -> str:
        return (self.option_ar or self.option_en) if lang == "ar" else self.option_en

    def unit_price(self) -> float:
        return float(self.price if self.price is not None else self.product.price)


class Piece(Base):
    """One physical object that exists.

    This is the row behind "Piece 04 of 12" (BRAND.md §8). It makes honest
    scarcity structural: what the page says is left is a count of rows, so
    there is no field anywhere in which to invent a shortage.

    Entering them costs one action — you say you made twelve and twelve rows
    are created and numbered.
    """

    __tablename__ = "pieces"
    __table_args__ = (
        UniqueConstraint("product_id", "number", name="uq_piece_number"),
        Index("ix_pieces_product_state", "product_id", "state"),
    )

    id: Mapped[str] = uuid_pk()
    product_id: Mapped[str] = uuid_fk("products.id")
    variant_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("product_variants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    batch_size: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[PieceState] = mapped_column(
        Enum(PieceState, name="piece_state"), default=PieceState.available, nullable=False
    )
    made_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # The photograph of *this* object, when it differs visibly from its
    # siblings — a grain, a hand-finished edge. Falls back to the product's.
    photo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # An honest note about this specific object: a small mark, a variation.
    # Saying it here costs a sentence; not saying it costs a refused package.
    note_en: Mapped[str] = mapped_column(Text, default="", nullable=False)
    note_ar: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    product: Mapped[Product] = relationship(back_populates="pieces")
    variant: Mapped[ProductVariant | None] = relationship(back_populates="pieces")

    def note(self, lang: str) -> str:
        return (self.note_ar or self.note_en) if lang == "ar" else self.note_en

    @property
    def label(self) -> str:
        return f"{self.number:02d}/{self.batch_size:02d}"


class ProductMedia(Base):
    """A photograph of the actual piece.

    BRAND.md §10: never a stock photo, never a supplier image. No schema can
    prove a file is genuine, so the rule is enforced where it can be — nothing
    leaves `draft` without one.
    """

    __tablename__ = "product_media"

    id: Mapped[str] = uuid_pk()
    product_id: Mapped[str] = uuid_fk("products.id")
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    alt_en: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    alt_ar: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    # A few seconds of the machine, or of the hand-finishing (BRAND.md §8).
    is_process_footage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    product: Mapped[Product] = relationship(back_populates="media")


class ProductEmbedding(Base):
    """Where a piece sits in meaning-space.

    Kept out of `products` on purpose: the vector is 6 KB, it is rewritten on a
    different schedule from the row, and a listing query would otherwise drag
    it across the wire once per card for nothing.

    It buys reach the category tree cannot express. "Minimal", "vintage",
    "matte black" are not branches — they are directions.
    """

    __tablename__ = "product_embeddings"
    __table_args__ = (
        # Declared here rather than only in the migration, so the models stay
        # the single description of the schema and autogenerate does not keep
        # proposing to drop an index it cannot see.
        Index(
            "ix_product_embeddings_cosine",
            "embedding",
            postgresql_using="ivfflat",
            postgresql_ops={"embedding": "vector_cosine_ops"},
            postgresql_with={"lists": "10"},
        ),
    )

    product_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    # Hash of the text that was embedded, so a re-embed is skipped when the
    # copy has not changed. Embedding calls cost money and rate-limit.
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    product: Mapped[Product] = relationship(back_populates="embedding")
