import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class ProductStatus(str, PyEnum):
    draft = "draft"
    active = "active"
    paused = "paused"
    deleted = "deleted"


class LabelGroup(str, PyEnum):
    style = "style"
    material = "material"
    audience = "audience"
    use_case = "use_case"
    season = "season"
    color = "color"
    brand = "brand"
    size = "size"
    other = "other"


# ── Product ↔ Label association ─────────────────────────────────────────────

class ProductLabel(Base):
    __tablename__ = "product_labels"

    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    label_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True
    )


# ── Category tree ─────────────────────────────────────────────────────────────

class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    icon: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    children: Mapped[list["Category"]] = relationship(
        "Category", backref="parent", foreign_keys=[parent_id], lazy="selectin"
    )
    products: Mapped[list["Product"]] = relationship("Product", back_populates="category")


# ── Label taxonomy ────────────────────────────────────────────────────────────

class Label(Base):
    __tablename__ = "labels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    group: Mapped[LabelGroup] = mapped_column(Enum(LabelGroup), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (UniqueConstraint("group", "name", name="uq_label_group_name"),)

    products: Mapped[list["Product"]] = relationship(
        "Product", secondary="product_labels", back_populates="labels"
    )


# ── Product ───────────────────────────────────────────────────────────────────

class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    seller_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    price: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="MAD", nullable=False)
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    category_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[ProductStatus] = mapped_column(
        Enum(ProductStatus), default=ProductStatus.draft, nullable=False, index=True
    )
    rating: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    category: Mapped[Category | None] = relationship("Category", back_populates="products")
    labels: Mapped[list[Label]] = relationship(
        "Label", secondary="product_labels", back_populates="products", lazy="selectin"
    )
    media: Mapped[list["ProductMedia"]] = relationship(
        "ProductMedia", back_populates="product", order_by="ProductMedia.sort_order", lazy="selectin"
    )


class ProductMedia(Base):
    __tablename__ = "product_media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    product: Mapped[Product] = relationship("Product", back_populates="media")
