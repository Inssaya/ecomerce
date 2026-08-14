from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import OrderStatus


def normalise_moroccan_phone(value: str) -> str:
    """Cash on delivery runs on the phone number — a wrong one is a refused
    package, and a refused package is the largest silent cost in this market.
    Normalised to the form the workshop can actually dial.

    Shared by checkout and by custom requests: both reach the same person by
    the same means, so the rule is written once.
    """
    digits = "".join(character for character in value if character.isdigit() or character == "+")
    if digits.startswith("+212"):
        digits = "0" + digits[4:]
    elif digits.startswith("212"):
        digits = "0" + digits[3:]
    if not (digits.startswith("0") and len(digits) == 10 and digits.isdigit()):
        raise ValueError("Enter a Moroccan phone number, for example 0612345678")
    return digits


class SelectedAttribute(BaseModel):
    """What the buyer picked from a piece's measures, colours or materials.

    The label is not required — a plain value like "M" has no name — and hex
    is only carried for colours. All of it is a **snapshot**: the server does
    not look it up against `product_attributes` and does not care whether the
    row still exists, because the point is that the order stays reconstructable
    the day the workshop corrects a typo six months later.
    """

    group: str
    name: str | None = None
    value: str
    hex: str | None = None


class CartLine(BaseModel):
    """What the customer wants, and how many.

    No price field, on purpose. The old checkout took the price from the
    request body and multiplied it out, which meant the amount collected at
    the door was whatever the client said it was. Prices are read from the
    database.

    Selection and personalization ride along here rather than as separate
    calls: the whole checkout is one request, and giving each line its own
    picks means two identical products with different names on them stay two
    lines and read correctly on the invoice.
    """

    product_id: str
    variant_id: str | None = None
    quantity: int = Field(ge=1, le=20)
    selection: list[SelectedAttribute] = Field(default_factory=list)
    #: The name the buyer wants written on it. The server refuses this on a
    #: piece that is not `personalizable`, and caps it at 20 characters — the
    #: same cap the piece page enforces.
    personalization: str | None = Field(default=None, max_length=20)


class Address(BaseModel):
    line1: str = Field(min_length=3, max_length=300)
    city: str = Field(min_length=2, max_length=120)
    notes: str | None = Field(default=None, max_length=500)


class CheckoutRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    phone: str = Field(min_length=8, max_length=30)
    email: EmailStr | None = None
    address: Address
    lang: str = "en"
    items: list[CartLine] = Field(min_length=1)

    _phone = field_validator("phone")(normalise_moroccan_phone)

    @field_validator("lang")
    @classmethod
    def supported(cls, value: str) -> str:
        return value if value in ("en", "ar") else "en"


class FindOrder(BaseModel):
    """Getting back to an order without the link.

    The phone goes through the same normaliser as checkout, so a number typed
    as "+212 612 345 678" still matches the "0612345678" that was stored.
    """

    reference: str = Field(min_length=4, max_length=12)
    phone: str = Field(min_length=8, max_length=30)

    _phone = field_validator("phone")(normalise_moroccan_phone)


class OrderItemResponse(BaseModel):
    #: Null on a custom-request line — it was described, not chosen from the
    #: catalogue. Typed non-null here until that became possible, which would
    #: have turned the first such order into a 500 on read.
    product_id: str | None = None
    variant_id: str | None = None
    piece_id: str | None = None
    title: str
    variant_label: str = ""
    #: "04/12" when the workshop numbered this batch.
    piece_label: str = ""
    #: Days promised at the time of ordering, for made-to-order work.
    lead_time_days: int | None = None
    unit_price: float
    quantity: int
    subtotal: float
    image_url: str | None
    #: Resolved from the product at read time — null once the product is
    #: archived, which is why this is not stored on the row itself.
    category: str | None = None
    subcategory: str | None = None
    #: What the buyer picked, frozen at checkout. See `SelectedAttribute`.
    selection: list[SelectedAttribute] | None = None
    #: Their name on the piece, when personalization was on.
    personalization: str | None = None

    model_config = {"from_attributes": True}


class OrderEventResponse(BaseModel):
    status: OrderStatus
    note: str | None
    created_at: datetime
    #: Who moved it — "workshop", "customer" or "system". Stored since the
    #: table was written and never returned, which left the timeline unable to
    #: tell an order the owner cancelled from one the 48-hour sweep released.
    actor: str = "system"

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: str
    reference: str
    tracking_token: str
    customer_name: str
    customer_phone: str
    customer_email: str | None
    address: dict
    city: str
    items: list[OrderItemResponse]
    events: list[OrderEventResponse]
    subtotal: float
    delivery_fee: float
    total: float
    status: OrderStatus
    note: str | None
    created_at: datetime
    whatsapp_url: str = ""
    #: The countdown's target date. Admin-editable; shown to the customer as
    #: "arrives by" on their tracking page.
    promised_for: date | None = None
    #: Guest vs Verified — derived from whether the order carries an account,
    #: never stored. `visitor_id` is deliberately absent from this schema: the
    #: fingerprint is an admin-internal join key, not something either side
    #: of the API needs to see on an order.
    has_account: bool = False
    #: True once archived from the console's default view. The customer-facing
    #: endpoints (`/orders/track/{token}`, `/orders/find`) never filter on
    #: this — hiding is an admin view preference, not a change to what tracks.
    hidden: bool = False

    model_config = {"from_attributes": True}


class StatusChange(BaseModel):
    status: OrderStatus
    note: str | None = Field(default=None, max_length=500)


class PromiseChange(BaseModel):
    """Moving the date the countdown counts to. A real date, same rule as
    everywhere else in this shop — BRAND.md §8, never "soon"."""

    promised_for: date


class MyOrders(BaseModel):
    """One account's history, and what it has actually paid.

    `total_spent` is delivered orders only — in a cash-on-delivery market the
    difference between placed and delivered is the whole business, and a
    profile that adds up refused packages is telling the customer a number
    nobody ever handed over.
    """

    orders: list[OrderResponse]
    total_spent: float
    delivered: int

