from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.models import ProductKind, ProductStatus


class MediaResponse(BaseModel):
    id: str
    url: str
    alt: str = ""
    is_primary: bool
    is_process_footage: bool = False
    sort_order: int


class CategoryNode(BaseModel):
    """A category as the storefront sees it: one name, in one language."""

    id: str
    slug: str
    name: str
    display_order: int
    children: list[CategoryNode] = []


class PieceOut(BaseModel):
    """One physical object, offered by name."""

    id: str
    number: int
    batch_size: int
    label: str
    made_on: date | None = None
    photo: str | None = None
    note: str = ""


class VariantOut(BaseModel):
    id: str
    sku: str
    option: str
    price: float
    #: Shelf: how many of this configuration exist. Null for made-to-order.
    available: int | None = None


class ProductCard(BaseModel):
    """What a listing row needs and nothing more — this is the payload that
    goes over a phone connection, 24 at a time."""

    id: str
    slug: str
    kind: ProductKind
    title: str
    price: float
    price_max: float | None = None
    image: str | None = None
    category_slug: str | None = None
    #: Shelf: pieces still available. Workshop: null — nothing to run out of.
    available: int | None = None
    #: Workshop: days until it is ready. Shelf: null — it already is.
    lead_time_days: int | None = None


class ProductDetail(ProductCard):
    description: str
    story: str
    images: list[MediaResponse]
    variants: list[VariantOut]
    #: Shelf only, and only when the workshop chose to number this batch.
    pieces: list[PieceOut] = []
    show_piece_numbers: bool = False
    batch_closed: bool = False
    made_on: date | None = None
    created_at: datetime


class ProductPage(BaseModel):
    items: list[ProductCard]
    total: int
    page: int
    size: int
    has_more: bool


# ── Owner-facing ──────────────────────────────────────────────────────────────
# The workshop authors both languages, so these carry both.


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
    """Creating a piece.

    `kind` decides what is required, because the two offers genuinely need
    different things: a made-to-order piece without a lead time has nothing
    honest to put on the page.
    """

    kind: ProductKind
    title_en: str = Field(min_length=1, max_length=300)
    title_ar: str = Field(default="", max_length=300)
    description_en: str = ""
    description_ar: str = ""
    story_en: str = ""
    story_ar: str = ""
    price: float = Field(gt=0)
    category_id: str | None = None
    status: ProductStatus = ProductStatus.draft

    made_on: date | None = None
    batch_closed: bool = False
    show_piece_numbers: bool = False

    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    price_max: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def coherent_for_its_kind(self) -> ProductWrite:
        if self.kind is ProductKind.workshop:
            if self.lead_time_days is None:
                raise ValueError(
                    "A made-to-order piece needs a lead time in days — "
                    "'ready in six days', never 'soon'"
                )
            if self.price_max is not None and self.price_max < self.price:
                raise ValueError("The upper price cannot be below the starting price")
        elif self.lead_time_days is not None or self.price_max is not None:
            raise ValueError("A piece already made has no lead time and no price range")
        return self


class ProductPatch(BaseModel):
    title_en: str | None = Field(default=None, min_length=1, max_length=300)
    title_ar: str | None = Field(default=None, max_length=300)
    description_en: str | None = None
    description_ar: str | None = None
    story_en: str | None = None
    story_ar: str | None = None
    price: float | None = Field(default=None, gt=0)
    category_id: str | None = None
    status: ProductStatus | None = None
    business_boost: float | None = Field(default=None, ge=0, le=5)
    made_on: date | None = None
    batch_closed: bool | None = None
    show_piece_numbers: bool | None = None
    lead_time_days: int | None = Field(default=None, ge=1, le=365)
    price_max: float | None = Field(default=None, gt=0)


class VariantWrite(BaseModel):
    sku: str = Field(min_length=1, max_length=60)
    option_en: str = Field(min_length=1, max_length=160)
    option_ar: str = Field(default="", max_length=160)
    price: float | None = Field(default=None, gt=0)
    display_order: int = 0
    is_active: bool = True


class PieceBatchWrite(BaseModel):
    """Adding pieces to the shelf.

    You say how many you made; the rows are created and numbered. There is no
    field for "stock" anywhere in this API — that is the point.
    """

    quantity: int = Field(ge=1, le=200)
    variant_id: str | None = None
    made_on: date | None = None
    note_en: str = ""
    note_ar: str = ""


class PieceAdmin(BaseModel):
    id: str
    number: int
    batch_size: int
    label: str
    state: str
    variant_id: str | None
    made_on: date | None
    photo_url: str | None
    note_en: str
    note_ar: str


class ProductAdmin(BaseModel):
    id: str
    slug: str
    kind: ProductKind
    title_en: str
    title_ar: str
    description_en: str
    description_ar: str
    story_en: str
    story_ar: str
    price: float
    price_max: float | None = None
    business_boost: float
    category_id: str | None
    status: ProductStatus
    images: list[MediaResponse]
    variants: list[VariantOut]
    available: int | None = None
    lead_time_days: int | None = None
    made_on: date | None = None
    batch_closed: bool = False
    show_piece_numbers: bool = False
    created_at: datetime
