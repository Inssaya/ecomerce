from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models import SecurityLevel


class SecurityEventOut(BaseModel):
    id: str
    created_at: datetime
    level: SecurityLevel
    kind: str
    message: str
    ip: str | None
    visitor_id: str | None
    user_id: str | None
    meta: dict | None = None

    model_config = {"from_attributes": True}


class BlockCreate(BaseModel):
    """Blocking a device, an address, or both in one action.

    A fingerprint block holds until lifted. An address is optional and
    always temporary — see `IP_BLOCK_HOURS` — because an IP can be a whole
    café and a permanent ban there punishes strangers.
    """

    reason: str = Field(min_length=1, max_length=500)
    visitor_id: str | None = Field(default=None, max_length=80)
    ip: str | None = Field(default=None, max_length=45)

    @model_validator(mode="after")
    def has_a_target(self) -> BlockCreate:
        if not self.visitor_id and not self.ip:
            raise ValueError("Block a device, an address, or both — not neither")
        return self


class BlockOut(BaseModel):
    id: str
    created_at: datetime
    reason: str
    ip: str | None
    visitor_id: str | None
    expires_at: datetime | None
    active: bool

    model_config = {"from_attributes": True}
