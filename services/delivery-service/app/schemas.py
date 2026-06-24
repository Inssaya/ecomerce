from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models import AvailabilityStatus, DeliveryKind


class DeliveryProfileCreate(BaseModel):
    kind: DeliveryKind
    company_name: Optional[str] = None
    coverage_zones: list[str] = []
    vehicle_type: Optional[str] = None


class DeliveryProfileUpdate(BaseModel):
    company_name: Optional[str] = None
    coverage_zones: Optional[list[str]] = None
    vehicle_type: Optional[str] = None
    availability_status: Optional[AvailabilityStatus] = None


class DeliveryProfileResponse(BaseModel):
    id: str
    user_id: str
    kind: DeliveryKind
    company_name: Optional[str]
    coverage_zones: list
    vehicle_type: Optional[str]
    availability_status: AvailabilityStatus
    rating: float
    total_deliveries: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignmentCreate(BaseModel):
    order_id: str
    agent_id: str
    notes: Optional[str] = None


class AssignmentStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None
    cod_collected: Optional[float] = None


class AssignmentResponse(BaseModel):
    id: str
    order_id: str
    agent_id: str
    status: str
    notes: Optional[str]
    assigned_at: datetime
    picked_up_at: Optional[datetime]
    delivered_at: Optional[datetime]
    cod_collected: Optional[float]

    model_config = {"from_attributes": True}
