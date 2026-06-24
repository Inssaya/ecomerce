import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class ViewEvent(Base):
    __tablename__ = "view_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_ref: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    dwell_ms: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(50), default="product_page")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_ref: Mapped[str] = mapped_column(String(100), primary_key=True)
    # Weighted category/label interest stored as JSON for simplicity
    # Shape: {"categories": {cat_id: score}, "labels": {label_id: score}}
    interests: Mapped[dict] = mapped_column(JSON, default=dict)
    last_viewed_products: Mapped[list] = mapped_column(JSON, default=list)  # last 50 product IDs
    total_events: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class InteractionEvent(Base):
    __tablename__ = "interaction_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_ref: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)  # view|add_to_cart|purchase
    weight: Mapped[float] = mapped_column(Float, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
