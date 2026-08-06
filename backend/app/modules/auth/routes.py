"""Accounts and sessions.

Ported from auth-user-service. Removed in the move: role selection at
registration (there is one owner, provisioned by `seed_owner`, and everyone
else is a customer) and the whole KYC submission/review flow.
"""
from __future__ import annotations

import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.config import settings
from app.core.cache import get_redis
from app.core.errors import bad_request
from app.core.security import (
    TokenError,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.deps import CurrentUser, DbSession
from app.models import RefreshToken, User, UserRole
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    UserUpdate,
)
from app.modules.auth.service import issue_session, revoke_all_sessions
from app.modules.notify.email import send_password_reset

router = APIRouter(prefix="/auth", tags=["auth"])

RESET_TOKEN_TTL_SECONDS = 3600


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: DbSession) -> TokenResponse:
    exists = await db.scalar(select(User.id).where(User.email == body.email))
    if exists:
        raise bad_request("That email is already registered")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        phone=body.phone,
        lang=body.lang if body.lang in ("en", "ar") else "en",
        role=UserRole.customer,
    )
    db.add(user)
    await db.flush()
    return await issue_session(db, user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    user = await db.scalar(select(User).where(User.email == body.email))
    # Same message and roughly the same work either way, so the response does
    # not reveal which addresses have accounts.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account is disabled")
    return await issue_session(db, user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: DbSession) -> TokenResponse:
    try:
        decode_token(body.refresh_token, expected_type="refresh")
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    stored = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_token(body.refresh_token),
            RefreshToken.revoked.is_(False),
        )
    )
    if stored is None or stored.expires_at < datetime.now(UTC):
        raise HTTPException(status_code=401, detail="Session expired — sign in again")

    user = await db.scalar(select(User).where(User.id == stored.user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Session expired — sign in again")

    # Rotate: the presented token is spent whether or not the client keeps it.
    stored.revoked = True
    return await issue_session(db, user)


@router.post("/logout", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: RefreshRequest, db: DbSession) -> None:
    stored = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(body.refresh_token))
    )
    if stored is not None:
        stored.revoked = True
        await db.commit()


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> User:
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(body: UserUpdate, user: CurrentUser, db: DbSession) -> User:
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/change-password", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def change_password(body: ChangePasswordRequest, user: CurrentUser, db: DbSession) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise bad_request("Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    # Every other session is invalidated: a password change is how someone
    # takes their account back.
    await revoke_all_sessions(db, user.id)
    await db.commit()


@router.post("/forgot-password", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(body: ForgotPasswordRequest, db: DbSession) -> None:
    user = await db.scalar(select(User).where(User.email == body.email))
    # Always 204 — the response must not reveal whether the address is known.
    if user is None:
        return

    token = secrets.token_urlsafe(32)
    await get_redis().setex(f"reset:{token}", RESET_TOKEN_TTL_SECONDS, user.id)
    await send_password_reset(
        to=user.email,
        lang=user.lang,
        reset_url=f"{settings.app_url}/{user.lang}/account/reset?token={token}",
    )


@router.post("/reset-password", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(body: ResetPasswordRequest, db: DbSession) -> None:
    redis = get_redis()
    user_id = await redis.get(f"reset:{body.token}")
    if not user_id:
        raise bad_request("This reset link has expired — request a new one")

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise bad_request("This reset link has expired — request a new one")

    user.password_hash = hash_password(body.new_password)
    await revoke_all_sessions(db, user.id)
    await db.commit()
    await redis.delete(f"reset:{body.token}")
