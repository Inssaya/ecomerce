from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import UserResponse, UserUpdate

router = APIRouter(prefix="/me", tags=["users"])


@router.get("", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.phone is not None:
        current_user.phone = body.phone
    if body.full_name is not None:
        current_user.full_name = body.full_name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/validate", tags=["internal"])
async def validate_token(current_user: User = Depends(get_current_user)):
    """Internal endpoint — gateway calls this to validate a JWT and get user info."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role.value,
        "status": current_user.status.value,
    }
