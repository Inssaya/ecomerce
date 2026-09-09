from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class ContactCreate(BaseModel):
    """A message from the contact form.

    Short on purpose, same reasoning as the custom-request form: a long form on
    a phone is a form nobody finishes.

    The email is required, and that is a change. It used to be "email or phone,
    either will do", which meant a message could arrive with no address to
    acknowledge it to — and the sender got a line of green text and no way to
    tell whether anything had actually happened. The address is what the
    receipt is sent to and what the reply comes from, so it is the one field
    the form cannot do without. The phone stays optional.
    """

    name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, min_length=6, max_length=30)
    message: str = Field(min_length=5, max_length=4000)


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
