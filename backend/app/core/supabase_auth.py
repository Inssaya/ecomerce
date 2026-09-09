"""Verifying the tokens Supabase issues.

This application no longer mints sessions — Supabase does, and everything here
is the *checking* half. The project signs with ES256, an asymmetric algorithm,
so what is needed to verify a token is the public key published at the
project's JWKS endpoint. Nothing in this process could forge a session even if
the whole container were read, which is the main thing gained by moving
identity out.

What is deliberately **not** here is authorization. Supabase says who somebody
is; whether they may open the console is the shop's own question, answered by
the `role` column on the local `users` row. Putting that in Supabase metadata
would move an application decision into a place the application does not
control, and make "who is the owner" editable from a dashboard rather than
from the shop's own database.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from jose import jwt
from jose.exceptions import JWTError

from app.config import settings

logger = logging.getLogger(__name__)

#: Signing keys rotate, but rarely. Cached so that a token check is not an
#: outbound HTTPS request — at one refresh an hour a rotation is picked up
#: quickly enough, and a key we have never seen forces an immediate refetch
#: below regardless of this.
_JWKS_TTL_SECONDS = 3600

_jwks: dict[str, Any] | None = None
_jwks_fetched_at: float = 0.0


class AuthError(Exception):
    """The token is missing, malformed, expired, or not ours."""


async def _fetch_jwks(force: bool = False) -> dict[str, Any]:
    global _jwks, _jwks_fetched_at
    fresh = _jwks is not None and (time.monotonic() - _jwks_fetched_at) < _JWKS_TTL_SECONDS
    if fresh and not force:
        return _jwks  # type: ignore[return-value]

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                settings.supabase_jwks_url,
                headers={"apikey": settings.supabase_anon_key},
            )
            response.raise_for_status()
            _jwks = response.json()
            _jwks_fetched_at = time.monotonic()
    except Exception as exc:
        # Serve a stale key set rather than signing everybody out because
        # Supabase blipped. Only a total absence of keys is fatal.
        if _jwks is not None:
            logger.warning("JWKS refresh failed, using cached keys: %s", exc)
            return _jwks
        raise AuthError("Could not fetch the signing keys") from exc
    return _jwks  # type: ignore[return-value]


def _key_for(jwks: dict[str, Any], kid: str | None) -> dict[str, Any] | None:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def verify(token: str) -> dict[str, Any]:
    """Return the claims of a valid Supabase access token, or raise `AuthError`.

    The signature, the expiry, the audience and the issuer are all checked. The
    issuer check is what stops a token minted by *some other* Supabase project
    from being accepted here.
    """
    if not settings.supabase_url:
        raise AuthError("No Supabase project configured")

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise AuthError("Malformed token") from exc

    kid = header.get("kid")
    jwks = await _fetch_jwks()
    key = _key_for(jwks, kid)
    if key is None:
        # An unknown `kid` is what a rotation looks like from here, so refetch
        # once before deciding the token is bad.
        jwks = await _fetch_jwks(force=True)
        key = _key_for(jwks, kid)
    if key is None:
        raise AuthError("Unknown signing key")

    try:
        return jwt.decode(
            token,
            key,
            algorithms=[key.get("alg", "ES256")],
            audience="authenticated",
            issuer=settings.supabase_issuer,
        )
    except JWTError as exc:
        raise AuthError(str(exc)) from exc
