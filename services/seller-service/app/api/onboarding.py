from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import SellerProfile, SellerStatus
from app.schemas import OnboardingRequest, SellerProfileResponse, SellerProfileUpdate

router = APIRouter(prefix="/profile", tags=["seller"])


class AdminStatusUpdate(BaseModel):
    status: SellerStatus


class AdminCommissionUpdate(BaseModel):
    commission_rate: float


def _require_seller(x_user_id: str | None, x_user_role: str | None) -> str:
    if not x_user_id or x_user_role not in ("seller", "admin"):
        raise HTTPException(status_code=403, detail="Seller access required")
    return x_user_id


@router.get("/me", response_model=SellerProfileResponse)
async def get_my_profile(
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    seller_id = _require_seller(x_user_id, x_user_role)
    result = await db.execute(select(SellerProfile).where(SellerProfile.user_id == seller_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Seller profile not found. Complete onboarding first.")
    return profile


@router.post("/onboarding", response_model=SellerProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    body: OnboardingRequest,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    seller_id = _require_seller(x_user_id, x_user_role)
    existing = await db.execute(select(SellerProfile).where(SellerProfile.user_id == seller_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Profile already exists")

    profile = SellerProfile(
        user_id=seller_id,
        store_name=body.store_name,
        description=body.description,
        coverage_zones=body.coverage_zones,
        label_preferences=body.label_preferences,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/me", response_model=SellerProfileResponse)
async def update_profile(
    body: SellerProfileUpdate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    seller_id = _require_seller(x_user_id, x_user_role)
    result = await db.execute(select(SellerProfile).where(SellerProfile.user_id == seller_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/all", response_model=list[SellerProfileResponse])
async def list_all_sellers(
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    result = await db.execute(select(SellerProfile).order_by(SellerProfile.created_at.desc()))
    return result.scalars().all()


@router.put("/{user_id}/admin-status", response_model=SellerProfileResponse)
async def admin_update_seller_status(
    user_id: str,
    body: AdminStatusUpdate,
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    result = await db.execute(select(SellerProfile).where(SellerProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Seller not found")
    profile.status = body.status
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("/{user_id}/commission", response_model=SellerProfileResponse)
async def admin_update_commission(
    user_id: str,
    body: AdminCommissionUpdate,
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if not (0 <= body.commission_rate <= 1):
        raise HTTPException(status_code=422, detail="commission_rate must be between 0 and 1")
    result = await db.execute(select(SellerProfile).where(SellerProfile.user_id == user_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Seller not found")
    profile.commission_rate = body.commission_rate
    await db.commit()
    await db.refresh(profile)
    return profile


@router.get("/{seller_id}", response_model=SellerProfileResponse)
async def get_seller_profile(seller_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SellerProfile).where(SellerProfile.user_id == seller_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Seller not found")
    return profile
