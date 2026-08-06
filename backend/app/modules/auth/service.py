"""Session issuing, shared by every route that hands out tokens.

register / login / refresh all end the same way — mint an access token, persist
a hashed refresh token, return both. That ending is written once, here.
"""
from __future__ import annotations

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, hash_token
from app.models import RefreshToken, User
from app.modules.auth.schemas import TokenResponse, UserResponse


async def issue_session(db: AsyncSession, user: User) -> TokenResponse:
    access = create_access_token(user.id, user.role.value)
    refresh, expires_at = create_refresh_token(user.id)
    db.add(RefreshToken(user_id=user.id, token_hash=hash_token(refresh), expires_at=expires_at))
    await db.commit()
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserResponse.model_validate(user),
    )


async def revoke_all_sessions(db: AsyncSession, user_id: str) -> None:
    """Sign every device out. Issued as one UPDATE rather than by walking the
    relationship — the sessions do not need loading to be revoked, and lazy
    loading one inside an async request raises."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )
