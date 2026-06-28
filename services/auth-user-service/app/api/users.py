from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import ChangePasswordRequest, UserResponse, UserUpdate
from app.security import hash_password, verify_password

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


@router.post("/change-password", status_code=204)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()


@router.get("/validate", tags=["internal"])
async def validate_token(current_user: User = Depends(get_current_user)):
    """Internal endpoint — gateway calls this to validate a JWT and get user info."""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role.value,
        "status": current_user.status.value,
    }
