from __future__ import annotations

from pydantic import BaseModel, EmailStr, field_validator

from app.modules.orders.schemas import normalise_moroccan_phone


class ContactOut(BaseModel):
    """What the storefront is allowed to know: how to reach the shop."""

    email: str
    phone: str


class ContactWrite(BaseModel):
    email: EmailStr
    phone: str

    _phone = field_validator("phone")(normalise_moroccan_phone)
