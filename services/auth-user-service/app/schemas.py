from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from app.models import KycStatus, UserRole, UserStatus


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    full_name: str | None = None
    phone: str | None = None

    @field_validator("password")
    @classmethod
    def strong_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("role")
    @classmethod
    def no_admin_self_register(cls, v: UserRole) -> UserRole:
        if v == UserRole.admin:
            raise ValueError("Cannot self-register as admin")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserInToken(BaseModel):
    id: str
    role: UserRole
    status: UserStatus


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserInToken


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    email: str
    phone: str | None
    full_name: str | None
    role: UserRole
    status: UserStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    phone: str | None = None
    full_name: str | None = None


class KycDocumentResponse(BaseModel):
    id: str
    doc_type: str
    full_name: str
    review_status: KycStatus
    rejection_reason: str | None
    submitted_at: datetime
    reviewed_at: datetime | None

    model_config = {"from_attributes": True}


class AdminUserResponse(UserResponse):
    kyc_documents: list[KycDocumentResponse] = []
