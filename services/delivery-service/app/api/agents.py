from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DeliveryProfile
from app.schemas import DeliveryProfileCreate, DeliveryProfileResponse, DeliveryProfileUpdate

router = APIRouter(prefix="/agents", tags=["delivery-agents"])


def _require_delivery(x_user_id: str | None, x_user_role: str | None) -> str:
    if not x_user_id or x_user_role not in ("delivery_individual", "delivery_company", "admin"):
        raise HTTPException(status_code=403, detail="Delivery agent access required")
    return x_user_id


@router.get("/me", response_model=DeliveryProfileResponse)
async def get_my_profile(
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    agent_id = _require_delivery(x_user_id, x_user_role)
    result = await db.execute(select(DeliveryProfile).where(DeliveryProfile.user_id == agent_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.post("/onboarding", response_model=DeliveryProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    body: DeliveryProfileCreate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    agent_id = _require_delivery(x_user_id, x_user_role)
    existing = await db.execute(select(DeliveryProfile).where(DeliveryProfile.user_id == agent_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Profile already exists")

    profile = DeliveryProfile(
        user_id=agent_id,
        kind=body.kind,
        company_name=body.company_name,
        coverage_zones=body.coverage_zones,
        vehicle_type=body.vehicle_type,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/me", response_model=DeliveryProfileResponse)
async def update_profile(
    body: DeliveryProfileUpdate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    agent_id = _require_delivery(x_user_id, x_user_role)
    result = await db.execute(select(DeliveryProfile).where(DeliveryProfile.user_id == agent_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/available", response_model=list[DeliveryProfileResponse])
async def list_available_agents(
    zone: str | None = None,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role not in ("admin",):
        raise HTTPException(status_code=403, detail="Admin access required")
    from app.models import AvailabilityStatus
    q = select(DeliveryProfile).where(DeliveryProfile.availability_status == AvailabilityStatus.available)
    result = await db.execute(q)
    agents = result.scalars().all()
    if zone:
        agents = [a for a in agents if zone in (a.coverage_zones or [])]
    return agents
