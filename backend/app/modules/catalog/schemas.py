from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models import ProductStatus


class MediaResponse(BaseModel):
    id: str
    url: str
    alt: str = ""
    is_primary: bool
    sort_order: int


class CategoryNode(BaseModel):
    """A category as the storefront sees it: one name, in one language."""

    id: str
    slug: str
    name: str
    display_order: int
    children: list[CategoryNode] = []


class ProductCard(BaseModel):
    """What a listing row needs and nothing more — this is the payload that
    goes over a phone connection, 24 at a time."""

    id: str
    slug: str
    title: str
    price: float
    stock: int
    image: str | None = None
    category_slug: str | None = None


class ProductDetail(ProductCard):
    description: str
    images: list[MediaResponse]
    created_at: datetime


# ── Owner-facing ──────────────────────────────────────────────────────────────
# The workshop edits both languages, so these carry both.


class CategoryWrite(BaseModel):
    name_en: str = Field(min_length=1, max_length=160)
    name_ar: str = Field(default="", max_length=160)
    parent_id: str | None = None
    display_order: int = 0
    is_active: bool = True


class CategoryAdmin(BaseModel):
    id: str
    slug: str
    name_en: str
    name_ar: str
    parent_id: str | None
    display_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class ProductWrite(BaseModel):
    title_en: str = Field(min_length=1, max_length=300)
    title_ar: str = Field(default="", max_length=300)
    description_en: str = ""
    description_ar: str = ""
    price: float = Field(gt=0)
    stock: int = Field(ge=0, default=0)
    category_id: str | None = None
    status: ProductStatus = ProductStatus.draft


class ProductPatch(BaseModel):
    title_en: str | None = Field(default=None, min_length=1, max_length=300)
    title_ar: str | None = Field(default=None, max_length=300)
    description_en: str | None = None
    description_ar: str | None = None
    price: float | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0)
    category_id: str | None = None
    status: ProductStatus | None = None


class ProductAdmin(BaseModel):
    id: str
    slug: str
    title_en: str
    title_ar: str
    description_en: str
    description_ar: str
    price: float
    stock: int
    category_id: str | None
    status: ProductStatus
    images: list[MediaResponse]
    created_at: datetime


class ProductPage(BaseModel):
    items: list[ProductCard]
    total: int
    page: int
    size: int
    has_more: bool
