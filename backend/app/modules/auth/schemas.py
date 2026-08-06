from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import UserRole

MIN_PASSWORD_LENGTH = 8


class _PasswordRule(BaseModel):
    @field_validator("password", "new_password", check_fields=False)
    @classmethod
    def long_enough(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        return value


class RegisterRequest(_PasswordRule):
    email: EmailStr
    password: str
    full_name: str | None = None
    phone: str | None = Field(default=None, max_length=30)
    lang: str = "en"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(_PasswordRule):
    token: str
    new_password: str


class ChangePasswordRequest(_PasswordRule):
    current_password: str
    new_password: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    phone: str | None
    role: UserRole
    lang: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = Field(default=None, max_length=30)
    lang: str | None = None

    @field_validator("lang")
    @classmethod
    def supported(cls, value: str | None) -> str | None:
        if value is not None and value not in ("en", "ar"):
            raise ValueError("Language must be 'en' or 'ar'")
        return value


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
