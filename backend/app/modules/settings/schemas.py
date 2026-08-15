from __future__ import annotations

from email_validator import EmailNotValidError, validate_email
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


class AdminSettingsOut(ContactOut):
    """Everything in `ContactOut`, plus the fields the storefront must never
    see. Only ever returned to an owner."""

    alert_emails: str


class AlertEmailsWrite(BaseModel):
    #: Comma-separated. Empty is valid — it means nobody is alerted.
    alert_emails: str = ""

    @field_validator("alert_emails")
    @classmethod
    def each_address_is_real(cls, value: str) -> str:
        addresses = [part.strip() for part in value.split(",") if part.strip()]
        for address in addresses:
            try:
                validate_email(address, check_deliverability=False)
            except EmailNotValidError as error:
                raise ValueError(f"'{address}' is not a valid email address") from error
        return ", ".join(addresses)
