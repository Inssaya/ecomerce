"""Password hashing and JWT issue/verify.

Ported from auth-user-service. The token payload is unchanged, so tokens issued
by the old service keep validating against the same secret.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenError(ValueError):
    """The token is missing, malformed, expired or signed with another key."""


def hash_password(password: str) -> str:
    return _pwd.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def hash_token(token: str) -> str:
    """Refresh tokens are stored hashed — a leaked database row is then not a
    usable credential."""
    return hashlib.sha256(token.encode()).hexdigest()


def _encode(claims: dict, expires: timedelta) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    expires_at = now + expires
    token = jwt.encode(
        {**claims, "iat": int(now.timestamp()), "exp": int(expires_at.timestamp())},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    return token, expires_at


def create_access_token(user_id: str, role: str) -> str:
    token, _ = _encode(
        {"sub": user_id, "role": role, "type": "access"},
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    return token


def create_refresh_token(user_id: str) -> tuple[str, datetime]:
    """`jti` makes each refresh token a distinct credential.

    Without it the payload is `{sub, type, iat, exp}` — identical for two
    sessions started in the same second, which produces the same token string,
    the same hash, and a unique-constraint violation on the second sign-in.
    A refresh token identifies one session, so it has to be unique by
    construction rather than by clock resolution.
    """
    return _encode(
        {"sub": user_id, "type": "refresh", "jti": secrets.token_urlsafe(12)},
        timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(token: str, *, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("type") != expected_type:
        raise TokenError(f"Expected a {expected_type} token")
    return payload


def new_tracking_token() -> str:
    return secrets.token_urlsafe(32)


def new_order_reference() -> str:
    """Short, unambiguous, readable over the phone — the customer reads this
    back to the workshop, so no characters that sound or look alike."""
    alphabet = "ACDEFGHJKLMNPQRTUVWXY3479"
    return "".join(secrets.choice(alphabet) for _ in range(8))
