from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator


class ContactCreate(BaseModel):
    """A message from the contact form.

    Short on purpose, same reasoning as the custom-request form: a long form on
    a phone is a form nobody finishes. Email and phone are each optional
    because the visitor might only have one to give — but at least one has to
    be there, or the message has no way back to them.
    """

    name: str = Field(min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=6, max_length=30)
    message: str = Field(min_length=5, max_length=4000)

    @model_validator(mode="after")
    def has_a_way_back(self) -> "ContactCreate":
        if not self.email and not self.phone:
            raise ValueError("Add an email or a phone number so we can reply")
        return self


class ContactMessageOut(BaseModel):
    id: str
    name: str
    email: str | None
    phone: str | None
    message: str
    created_at: datetime
    read_at: datetime | None
    archived_at: datetime | None = None

    model_config = {"from_attributes": True}


class ContactMessagePatch(BaseModel):
    """Filing a message away. Read state stays separate — a message can be
    read and still sitting in the queue, or archived without ever being read
    (which is what happens to spam)."""

    archived: bool
