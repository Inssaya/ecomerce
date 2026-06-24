from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ViewEventCreate(BaseModel):
    product_id: str
    dwell_ms: int
    source: str = "product_page"
    category_id: Optional[str] = None
    label_ids: list[str] = []


class InteractionEventCreate(BaseModel):
    product_id: str
    event_type: str
    weight: float = 1.0


class ViewEventResponse(BaseModel):
    id: str
    user_ref: str
    product_id: str
    dwell_ms: int
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class RecommendationItem(BaseModel):
    product_id: str
    score: float
    reason: str


class RecommendationsResponse(BaseModel):
    user_ref: str
    items: list[RecommendationItem]


class TrendingResponse(BaseModel):
    product_ids: list[str]
    window_hours: int
