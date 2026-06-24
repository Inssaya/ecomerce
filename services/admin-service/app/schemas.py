from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class KycReviewRequest(BaseModel):
    decision: str  # approved | rejected
    rejection_reason: Optional[str] = None


class UserStatusUpdate(BaseModel):
    status: str  # active | restricted | banned


class MetricsResponse(BaseModel):
    total_users: int
    active_sellers: int
    pending_kyc: int
    total_orders: int
    orders_today: int
    total_revenue: float
    pending_deliveries: int


class PaginatedResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int
