import secrets

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.email import send_email
from app.models import User
from app.schemas import ForgotPasswordRequest, ResetPasswordRequest
from app.security import hash_password

router = APIRouter(tags=["auth"])

_RESET_TTL = 3600  # 1 hour


def _redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


@router.post("/forgot-password", status_code=204)
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    # Always 204 — never reveal whether an email is registered
    if not user:
        return

    token = secrets.token_urlsafe(32)
    r = _redis()
    try:
        await r.setex(f"reset:{token}", _RESET_TTL, user.id)
    finally:
        await r.aclose()

    reset_url = f"{settings.app_url}/auth/reset-password?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0a0a0a;color:#fff;border-radius:12px;">
      <h2 style="color:#f97316;margin-bottom:16px;">Reset your password</h2>
      <p>You requested a password reset for your {settings.app_name} account.</p>
      <p>Click the button below to set a new password. This link expires in 1 hour.</p>
      <p style="margin-top:24px;">
        <a href="{reset_url}" style="display:inline-block;padding:12px 28px;background:#f97316;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Reset password
        </a>
      </p>
      <hr style="border-color:#333;margin:24px 0;" />
      <p style="color:#666;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      <p style="color:#666;font-size:13px;">{settings.app_name}</p>
    </div>
    """
    await send_email(user.email, f"Reset your password — {settings.app_name}", html)


@router.post("/reset-password", status_code=204)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    r = _redis()
    try:
        user_id = await r.get(f"reset:{body.token}")
        if not user_id:
            raise HTTPException(status_code=400, detail="Invalid or expired reset link")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=400, detail="User not found")

        user.password_hash = hash_password(body.new_password)
        await db.commit()
        await r.delete(f"reset:{body.token}")
    finally:
        await r.aclose()
