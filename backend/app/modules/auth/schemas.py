"""What the shop still says about an account.

The password, login, refresh and reset shapes have gone with the endpoints
that used them — Supabase owns all of that now. What remains describes a
person as the *shop* knows them: where to deliver, which language to write in,
and which door they may open.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models import UserRole


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    phone: str | None
    address_line1: str | None = None
    city: str | None = None
    role: UserRole
    lang: str
    avatar_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = Field(default=None, max_length=30)
    address_line1: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    lang: str | None = None

    @field_validator("lang")
    @classmethod
    def supported(cls, value: str | None) -> str | None:
        if value is not None and value not in ("en", "ar"):
            raise ValueError("Language must be 'en' or 'ar'")
        return value
