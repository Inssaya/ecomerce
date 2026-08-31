from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.models import AttributeGroup, DiscountKind, ProductStatus


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


class VariantOut(BaseModel):
    id: str
    sku: str
    option: str
    price: float


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
    title: str
    price: float
    image: str | None = None
    category_slug: str | None = None
    category_name: str | None = None
    #: What it costs today. Computed on the server, once, so the card and the
    #: cart cannot disagree with the piece page about the number the buyer sees.
    effective_price: float
    discount_active: bool = False


class ProductDetail(ProductCard):
    description: str
    story: str
    images: list[MediaResponse]
    variants: list[VariantOut]
    made_on: date | None = None
    created_at: datetime
    #: The three groups of specification. Any can be empty.
    attributes: list[AttributeOut] = []
    #: Whether the buyer can put their name on it, and how much that costs.
    personalizable: bool = False
    personalization_markup_pct: float = 0


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
    """Creating a piece. One price, one kind of thing — no shelf/workshop
    distinction, no upper price bound."""

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

    personalizable: bool = False
    personalization_markup_pct: float = Field(default=0, ge=0, le=500)

    discount_kind: DiscountKind | None = None
    discount_value: float | None = Field(default=None, gt=0)
    discount_active: bool = False

    @model_validator(mode="after")
    def coherent_discount(self) -> ProductWrite:
        check_discount(self.discount_kind, self.discount_value, self.price)
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


class ProductAdmin(BaseModel):
    id: str
    slug: str
    title_en: str
    title_ar: str
    description_en: str
    description_ar: str
    story_en: str
    story_ar: str
    price: float
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
    created_at: datetime
    #: Drives the small green "modified" line under the creation date.
    updated_at: datetime
