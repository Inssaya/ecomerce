from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import OrderStatus


class CartLine(BaseModel):
    """What the customer wants, and how many.

    Deliberately no price field. The old checkout took the price from the
    request body and multiplied it out, which meant the amount collected at the
    door was whatever the client said it was. Prices are read from the
    database.
    """

    product_id: str
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

    @field_validator("phone")
    @classmethod
    def moroccan_phone(cls, value: str) -> str:
        """Cash on delivery runs on the phone number — a wrong one is a
        refused package. Normalised so the workshop can always dial it."""
        digits = "".join(character for character in value if character.isdigit() or character == "+")
        if digits.startswith("+212"):
            digits = "0" + digits[4:]
        elif digits.startswith("212"):
            digits = "0" + digits[3:]
        if not (digits.startswith("0") and len(digits) == 10 and digits.isdigit()):
            raise ValueError("Enter a Moroccan phone number, for example 0612345678")
        return digits

    @field_validator("lang")
    @classmethod
    def supported(cls, value: str) -> str:
        return value if value in ("en", "ar") else "en"


class OrderItemResponse(BaseModel):
    product_id: str
    title: str
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
