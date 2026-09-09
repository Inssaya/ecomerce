"""Shared request dependencies: identity, language, paging.

SECURITY NOTE — why this file exists at all.

Under the old architecture the gateway verified the JWT and injected
`X-User-Id` / `X-User-Role` headers, and every service trusted them:

    x_user_role: str | None = Header(default=None)
    if x_user_role != "admin": raise HTTPException(403)

That was only ever safe because the services were unreachable except through
the gateway. The gateway is gone, so those headers are now attacker-supplied
strings — anyone could have sent `X-User-Role: admin` straight to the app and
been believed. Every one of those checks is replaced by the dependencies below,
which verify the signature on the bearer token itself.

NOTE: no `from __future__ import annotations` in this module. It would turn the
`Annotated[int, Query(ge=1)]` parameters of `Page` into strings, which FastAPI
cannot resolve back into query-parameter metadata — every paged endpoint then
fails at request time rather than at import.
"""
from typing import Annotated

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenError, decode_token
from app.db import get_db
from app.models import User, UserRole

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]

SUPPORTED_LANGS = ("en", "ar")


async def _user_from_credentials(
    credentials: HTTPAuthorizationCredentials | None,
    db: AsyncSession,
) -> User | None:
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except TokenError:
        return None
    user = await db.scalar(select(User).where(User.id == payload.get("sub", "")))
    if user is None or not user.is_active:
        return None
    return user


async def current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: DbSession,
) -> User | None:
    """For endpoints that work signed out — the whole storefront. Buying never
    requires an account."""
    return await _user_from_credentials(credentials, db)


async def current_user(
    user: Annotated[User | None, Depends(current_user_optional)],
) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def require_owner(user: Annotated[User, Depends(current_user)]) -> User:
    """The workshop's own account. There is exactly one."""
    if user.role is not UserRole.owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workshop access only")
    return user


def language(request: Request) -> str:
    """Which of the two languages to answer in.

    `?lang=` wins, then Accept-Language, then English. Arabic and English are
    the only options — BRAND.md and REBUILD-PLAN §10 both make that permanent.
    """
    requested = (request.query_params.get("lang") or "").lower()
    if requested in SUPPORTED_LANGS:
        return requested
    header = (request.headers.get("accept-language") or "").lower()
    return "ar" if header.startswith("ar") else "en"


def visitor_id(request: Request) -> str | None:
    """The anonymous visitor's stable id, set by the frontend fingerprint.

    99% of buyers arrive on a phone and most never sign in, so this — not the
    user id — is what the feed learns from.
    """
    return request.headers.get("x-visitor-id") or request.cookies.get("_vid")


class Page:
    """Offset paging, declared once instead of re-adding `page`/`size` query
    parameters with slightly different bounds to every list endpoint."""

    def __init__(
        self,
        page: Annotated[int, Query(ge=1)] = 1,
        size: Annotated[int, Query(ge=1, le=60)] = 24,
    ) -> None:
        self.page = page
        self.size = size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(current_user_optional)]
Owner = Annotated[User, Depends(require_owner)]
Lang = Annotated[str, Depends(language)]
Visitor = Annotated[str | None, Depends(visitor_id)]
Paging = Annotated[Page, Depends()]
