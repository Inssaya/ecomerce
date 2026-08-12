from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.requests import RequestStatus
from app.modules.orders.schemas import normalise_moroccan_phone


class RequestCreate(BaseModel):
    """Tell us what you need.

    Short on purpose: a long form on a phone is a form nobody finishes. The
    description and a number we can call are the only things that matter.
    """

    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=8, max_length=30)
    email: EmailStr | None = None
    city: str | None = Field(default=None, max_length=120)
    description: str = Field(min_length=10, max_length=4000)
    #: What kind of thing it is. Optional, because a required field on this
    #: form is a request that does not get sent — and a request in free text
    #: is still worth having.
    category_id: str | None = None
    budget: float | None = Field(default=None, gt=0)
    references: list[str] = Field(default_factory=list, max_length=6)
    lang: str = "en"
    #: Set when the request came out of a conversation about a specific piece.
    product_id: str | None = None
    source: str = Field(default="form", max_length=40)

    _phone = field_validator("phone")(normalise_moroccan_phone)

    @field_validator("lang")
    @classmethod
    def supported(cls, value: str) -> str:
        return value if value in ("en", "ar") else "en"


class Quote(BaseModel):
    """What it will cost and when it will be ready.

    Both are required. A quote without a date is the vagueness BRAND.md §8
    rules out, and it is what makes someone refuse the package later.
    """

    price: float = Field(gt=0)
    lead_time_days: int = Field(ge=1, le=365)
    note_en: str = Field(default="", max_length=2000)
    note_ar: str = Field(default="", max_length=2000)


class RequestStatusChange(BaseModel):
    status: RequestStatus
    note: str | None = Field(default=None, max_length=1000)


class RequestEventOut(BaseModel):
    status: RequestStatus
    note: str | None
    created_at: datetime
    #: Whether the workshop moved this or the customer did. Approval is the
    #: customer's action, so without this the timeline reads as if the owner
    #: approved their own quote.
    actor: str = "system"

    model_config = {"from_attributes": True}


class RequestOut(BaseModel):
    id: str
    reference: str
    tracking_token: str
    customer_name: str
    customer_phone: str
    customer_email: str | None
    city: str | None
    description: str
    budget: float | None
    references: list[str]
    #: What kind of thing was asked for, and where the ask came from. Both are
    #: stored and neither was returned, so the console could not group twenty
    #: unrelated requests into "eleven people asked for a lamp this month" —
    #: which is the whole point of collecting the category.
    category_id: str | None = None
    source: str | None = None
    status: RequestStatus
    quote_price: float | None
    quote_note: str = ""
    lead_time_days: int | None
    promised_for: date | None
    order_reference: str | None = None
    events: list[RequestEventOut]
    created_at: datetime
    whatsapp_url: str = ""
