from jose import JWTError, jwt

from app.config import settings

# Paths that require no authentication (GET requests to these are also public)
_PUBLIC_EXACT = {
    "/health",
    "/ready",
    "/docs",
    "/openapi.json",
}

_PUBLIC_POST = {
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/refresh",
}

_PUBLIC_GET_PREFIXES = (
    "/api/v1/catalog/",
    "/api/v1/recommendations/",
)


def is_public(path: str, method: str) -> bool:
    if path in _PUBLIC_EXACT:
        return True
    if method == "POST" and path in _PUBLIC_POST:
        return True
    if method in ("GET", "HEAD", "OPTIONS") and any(
        path.startswith(p) for p in _PUBLIC_GET_PREFIXES
    ):
        return True
    return False


def extract_user_headers(authorization: str | None) -> dict[str, str]:
    """
    Validate the Bearer token and return headers to forward to upstream services.
    Returns an empty dict if no token is present (unauthenticated request on a public route).
    Raises ValueError if the token is invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return {}

    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc

    headers: dict[str, str] = {}
    if user_id := payload.get("sub"):
        headers["X-User-ID"] = user_id
    if role := payload.get("role"):
        headers["X-User-Role"] = role
    return headers
