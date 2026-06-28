import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, Float, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class SellerStatus(str, PyEnum):
    pending = "pending"
    verified = "verified"
    suspended = "suspended"


class SellerProfile(Base):
    __tablename__ = "seller_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    store_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    coverage_zones: Mapped[list] = mapped_column(JSON, default=list)
    label_preferences: Mapped[list] = mapped_column(JSON, default=list)
    commission_rate: Mapped[float] = mapped_column(Float, default=0.05)
    payout_balance: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[SellerStatus] = mapped_column(Enum(SellerStatus), default=SellerStatus.pending)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CommissionLedger(Base):
    __tablename__ = "commission_ledger"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    seller_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    gross_amount: Mapped[float] = mapped_column(Float, nullable=False)
    commission_rate: Mapped[float] = mapped_column(Float, nullable=False)
    commission_amount: Mapped[float] = mapped_column(Float, nullable=False)
    net_amount: Mapped[float] = mapped_column(Float, nullable=False)
    settled: Mapped[bool] = mapped_column(Boolean, default=False)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PayoutRecord(Base):
    __tablename__ = "payout_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    seller_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
