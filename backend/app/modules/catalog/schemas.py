from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models import AttributeGroup, DiscountKind, ProductKind, ProductStatus
from app.modules.orders.schemas import normalise_moroccan_phone


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
    icon_url: str | None = None
    display_order: int
    children: list[CategoryNode] = []


class PieceOut(BaseModel):
    """One physical object, offered by name.

    The whole batch is returned, sold ones included, so the page can show what
    was made rather than only what is left. Seeing three of four struck through
    is honest scarcity; a bare "1 left" is a claim you have to take on trust.
    """

    id: str
    number: int
    batch_size: int
    label: str
    #: available | reserved | sold | kept
    state: str
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


class AttributeOut(BaseModel):
    """One line of specification, ready to print.

    `label` is composed on the server rather than in each client, so "Width"
    and "10 cm" are joined the same way on the console, the piece page and the
    order line.
    """

    id: str
    group: AttributeGroup
    name: str | None = None
    value: str
    hex: str | None = None
    display_order: int
    label: str


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
    category_name: str | None = None
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


class AlertRequest(BaseModel):
    """Waiting on a piece. One field that matters, and an optional second.

    The phone goes through the same normaliser as checkout — this is the same
    person, reached the same way.
    """

    phone: str = Field(min_length=8, max_length=30)
    email: EmailStr | None = None

    _phone = field_validator("phone")(normalise_moroccan_phone)


class ProductPage(BaseModel):
    items: list[ProductCard]
    total: int
    page: int
    size: int
    has_more: bool


# ── Owner-facing ──────────────────────────────────────────────────────────────
# The workshop authors both languages, so these carry both.


def check_discount(
    kind: DiscountKind | None, value: float | None, price: float | None
) -> None:
    """A reduction has to leave something to pay.

    Shared by the create schema and the patch route because a patch can change
    the price, the kind or the value one at a time, and the combination that
    matters is the one that ends up on the row — not the one in any single
    request. Raises `ValueError`; FastAPI turns that into a 422 in a schema,
    and the route wraps it into a 400 with the same sentence.
    """
    if kind is None and value is None:
        return
    if (kind is None) != (value is None):
        raise ValueError("A reduction needs both a kind and a value")
    if kind is DiscountKind.percent and not 0 < value <= 100:  # type: ignore[operator]
        raise ValueError("A percentage reduction has to be between 0 and 100")
    if kind is DiscountKind.fixed and price is not None and value >= price:  # type: ignore[operator]
        raise ValueError("That reduction is the whole price or more — the piece would be free")


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
    icon_url: str | None
    parent_id: str | None
    display_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class ProductWrite(BaseModel):
    """Creating a piece.

    `kind` decides what is required, because the two offers genuinely need
    different things: a made-to-order piece without a lead time has nothing
    honest to put on the page (BRAND.md §8).
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

    delivery_days: int | None = Field(default=None, ge=1, le=365)
    personalizable: bool = False
    personalization_markup_pct: float = Field(default=0, ge=0, le=500)

    discount_kind: DiscountKind | None = None
    discount_value: float | None = Field(default=None, gt=0)
    discount_active: bool = False

    @model_validator(mode="after")
    def coherent_discount(self) -> ProductWrite:
        check_discount(self.discount_kind, self.discount_value, self.price)
        return self

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

    delivery_days: int | None = Field(default=None, ge=1, le=365)
    personalizable: bool | None = None
    personalization_markup_pct: float | None = Field(default=None, ge=0, le=500)

    # Coherence is checked in the route rather than here: a patch may set the
    # value today and the kind tomorrow, so the only combination worth
    # validating is the one that ends up on the row.
    discount_kind: DiscountKind | None = None
    discount_value: float | None = Field(default=None, gt=0)
    discount_active: bool | None = None


class AttributeWrite(BaseModel):
    """Adding a measure, a colour or a material.

    `name` is optional because both shapes are real: "Width" → "10 cm", and a
    bare "M". A blank name is stored as null so the two never drift apart.
    """

    group: AttributeGroup
    name: str | None = Field(default=None, max_length=60)
    value: str = Field(min_length=1, max_length=120)
    hex: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    display_order: int = 0

    @model_validator(mode="after")
    def tidy(self) -> AttributeWrite:
        self.name = (self.name or "").strip() or None
        self.value = self.value.strip()
        if not self.value:
            raise ValueError("A measure, colour or material needs a value")
        # A hex on a material is a field nothing will ever read.
        if self.hex and self.group is not AttributeGroup.color:
            raise ValueError("Only a colour carries a hex")
        return self


class AttributePatch(BaseModel):
    name: str | None = Field(default=None, max_length=60)
    value: str | None = Field(default=None, min_length=1, max_length=120)
    hex: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    display_order: int | None = None


class ColorSuggestion(BaseModel):
    value: str
    hex: str | None = None


class AttributeSuggestions(BaseModel):
    """What to offer in the dropdowns.

    Built-in starting points, plus everything this shop has already used —
    so the list grows as the workshop works and nobody has to maintain a
    settings screen for it.
    """

    measure_names: list[str]
    measure_values: list[str]
    material_names: list[str]
    material_values: list[str]
    colors: list[ColorSuggestion]


class ProductAnalytics(BaseModel):
    """How one piece is doing, in the same terms as the shop-wide table."""

    period: dict
    saw: int
    opened: int
    opened_pct: float
    stayed: int
    avg_seconds: float
    added: int
    bought: int
    bought_pct: float
    #: Every day in the period, including the empty ones.
    daily: list[dict]


class VariantWrite(BaseModel):
    sku: str = Field(min_length=1, max_length=60)
    option_en: str = Field(min_length=1, max_length=160)
    option_ar: str = Field(default="", max_length=160)
    price: float | None = Field(default=None, gt=0)


class VariantPatch(BaseModel):
    """Correcting a variant that already exists. Everything optional — an
    unset field is left alone rather than nulled."""

    sku: str | None = Field(default=None, min_length=1, max_length=60)
    option_en: str | None = Field(default=None, min_length=1, max_length=160)
    option_ar: str | None = Field(default=None, max_length=160)
    price: float | None = Field(default=None, gt=0)
    display_order: int | None = None
    is_active: bool | None = None


class MediaPatch(BaseModel):
    """Alt text and the process-footage flag, after the fact."""

    alt_en: str | None = Field(default=None, max_length=300)
    alt_ar: str | None = Field(default=None, max_length=300)
    is_process_footage: bool | None = None
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
    #: Resolved from the tree, so the table has real columns rather than ids.
    #: A product filed under a subcategory reports both; one filed under a top
    #: category reports only the first.
    category_name: str | None = None
    subcategory_name: str | None = None
    status: ProductStatus
    images: list[MediaResponse]
    variants: list[VariantOut]
    attributes: list[AttributeOut] = []
    available: int | None = None
    lead_time_days: int | None = None
    delivery_days: int | None = None
    personalizable: bool = False
    personalization_markup_pct: float = 0
    discount_kind: DiscountKind | None = None
    discount_value: float | None = None
    discount_active: bool = False
    #: What it costs today. Computed once on the server — see
    #: `Product.effective_price`.
    effective_price: float
    #: Pinterest-style hearts and buy-later saves. Always 0 until the
    #: interactions table exists; the columns are here so the table that shows
    #: them does not have to change shape twice.
    total_likes: int = 0
    total_saves: int = 0
    made_on: date | None = None
    batch_closed: bool = False
    show_piece_numbers: bool = False
    created_at: datetime
    #: Drives the small green "modified" line under the creation date.
    updated_at: datetime
