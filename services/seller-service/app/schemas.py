from datetime import datetime
from pydantic import BaseModel, Field
from app.models import SellerStatus


class OnboardingRequest(BaseModel):
    store_name: str
    description: str = ""
    coverage_zones: list[str] = []
    label_preferences: list[str] = []


class SellerProfileUpdate(BaseModel):
    store_name: str | None = None
    description: str | None = None
    coverage_zones: list[str] | None = None
    label_preferences: list[str] | None = None


class SellerProfileResponse(BaseModel):
    id: str
    user_id: str
    store_name: str
    description: str
    logo_url: str | None
    coverage_zones: list
    label_preferences: list
    commission_rate: float
    payout_balance: float
    status: SellerStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class CommissionLedgerResponse(BaseModel):
    id: str
    order_id: str
    seller_id: str
    gross_amount: float
    commission_rate: float
    commission_amount: float
    net_amount: float
    settled: bool
    created_at: datetime

    model_config = {"from_attributes": True}
