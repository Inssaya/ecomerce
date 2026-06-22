from datetime import datetime

from pydantic import BaseModel, Field

from app.models import LabelGroup, ProductStatus


# ── Category ──────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str
    parent_id: str | None = None
    icon: str | None = None
    display_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class CategoryResponse(BaseModel):
    id: str
    name: str
    slug: str
    icon: str | None
    parent_id: str | None
    display_order: int
    is_active: bool
    children: list["CategoryResponse"] = []

    model_config = {"from_attributes": True}


CategoryResponse.model_rebuild()


# ── Label ─────────────────────────────────────────────────────────────────────

class LabelCreate(BaseModel):
    group: LabelGroup
    name: str


class LabelResponse(BaseModel):
    id: str
    group: LabelGroup
    name: str
    slug: str

    model_config = {"from_attributes": True}


# ── Product media ─────────────────────────────────────────────────────────────

class ProductMediaResponse(BaseModel):
    id: str
    url: str
    is_primary: bool
    sort_order: int

    model_config = {"from_attributes": True}


# ── Product ───────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    title: str
    description: str = ""
    price: float = Field(gt=0)
    currency: str = "MAD"
    stock: int = Field(ge=0, default=0)
    category_id: str | None = None
    label_ids: list[str] = []
    status: ProductStatus = ProductStatus.draft


class ProductUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    price: float | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0)
    category_id: str | None = None
    label_ids: list[str] | None = None
    status: ProductStatus | None = None


class ProductResponse(BaseModel):
    id: str
    seller_id: str
    title: str
    description: str
    price: float
    currency: str
    stock: int
    category_id: str | None
    category: CategoryResponse | None = None
    labels: list[LabelResponse] = []
    media: list[ProductMediaResponse] = []
    status: ProductStatus
    rating: float
    view_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    page: int
    size: int
    pages: int


class SearchResponse(BaseModel):
    hits: list[dict]
    total: int
    query: str
    processing_time_ms: int
