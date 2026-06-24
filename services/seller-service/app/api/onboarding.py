from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import SellerProfile
from app.schemas import OnboardingRequest, SellerProfileResponse, SellerProfileUpdate

router = APIRouter(prefix="/profile", tags=["seller"])


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


@router.get("/{seller_id}", response_model=SellerProfileResponse)
async def get_seller_profile(seller_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SellerProfile).where(SellerProfile.user_id == seller_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Seller not found")
    return profile
