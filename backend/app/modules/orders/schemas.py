from __future__ import annotations

from datetime import datetime

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


class CartLine(BaseModel):
    """What the customer wants, and how many.

    Deliberately no price field. The old checkout took the price from the
    request body and multiplied it out, which meant the amount collected at the
    door was whatever the client said it was. Prices are read from the
    database.
    """

    product_id: str
    variant_id: str | None = None
    quantity: int = Field(ge=1, le=20)


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
    product_id: str
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

    model_config = {"from_attributes": True}


class OrderEventResponse(BaseModel):
    status: OrderStatus
    note: str | None
    created_at: datetime

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

    model_config = {"from_attributes": True}


class StatusChange(BaseModel):
    status: OrderStatus
    note: str | None = Field(default=None, max_length=500)


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

