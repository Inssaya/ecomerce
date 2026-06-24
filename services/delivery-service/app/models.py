import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Float, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class DeliveryKind(str, PyEnum):
    individual = "individual"
    company = "company"


class AvailabilityStatus(str, PyEnum):
    available = "available"
    busy = "busy"
    offline = "offline"


class DeliveryProfile(Base):
    __tablename__ = "delivery_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    kind: Mapped[DeliveryKind] = mapped_column(Enum(DeliveryKind), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    coverage_zones: Mapped[list] = mapped_column(JSON, default=list)
    vehicle_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    availability_status: Mapped[AvailabilityStatus] = mapped_column(
        Enum(AvailabilityStatus), default=AvailabilityStatus.offline
    )
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    total_deliveries: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), default="assigned")
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cod_collected: Mapped[float | None] = mapped_column(Float, nullable=True)
