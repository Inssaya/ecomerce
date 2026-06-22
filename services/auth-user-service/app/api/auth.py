from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import RefreshToken, User, UserStatus
from app.schemas import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)

router = APIRouter(tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        full_name=body.full_name,
        phone=body.phone,
        status=UserStatus.active,  # KYC check is separate; account starts active
    )
    db.add(user)
    await db.flush()

    access = create_access_token(user.id, user.role.value)
    refresh_raw, expires_at = create_refresh_token(user.id)
    rt = RefreshToken(user_id=user.id, token_hash=hash_token(refresh_raw), expires_at=expires_at)
    db.add(rt)
    await db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh_raw)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.status == UserStatus.banned:
        raise HTTPException(status_code=403, detail="Account banned")

    access = create_access_token(user.id, user.role.value)
    refresh_raw, expires_at = create_refresh_token(user.id)
    rt = RefreshToken(user_id=user.id, token_hash=hash_token(refresh_raw), expires_at=expires_at)
    db.add(rt)
    await db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh_raw)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    from app.security import decode_token

    try:
        payload = decode_token(body.refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    token_hash = hash_token(body.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.is_revoked.is_(False),
        )
    )
    rt = result.scalar_one_or_none()
    if not rt or rt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired or revoked")

    user_result = await db.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    rt.is_revoked = True
    new_access = create_access_token(user.id, user.role.value)
    new_refresh_raw, new_expires_at = create_refresh_token(user.id)
    new_rt = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(new_refresh_raw),
        expires_at=new_expires_at,
    )
    db.add(new_rt)
    await db.commit()
    return TokenResponse(access_token=new_access, refresh_token=new_refresh_raw)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hash_token(body.refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    rt = result.scalar_one_or_none()
    if rt:
        rt.is_revoked = True
        await db.commit()
