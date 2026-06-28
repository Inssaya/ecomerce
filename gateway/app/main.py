import logging
import time
import uuid
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.middleware.auth import extract_user_headers, is_public
from app.routes.proxy import router as proxy_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("gateway")

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Gateway started")
    yield
    await app.state.redis.aclose()
    logger.info("Gateway shut down")


app = FastAPI(title="Ecomerce API Gateway", version="0.1.0", docs_url="/docs", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_AUTH_PATHS = ("/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password")
_GENERAL_LIMIT = 200
_AUTH_LIMIT = 10


async def _check_rate_limit(redis: aioredis.Redis, key: str, limit: int) -> bool:
    """Returns True if request is allowed, False if rate limit exceeded."""
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 60)
    return count <= limit


@app.middleware("http")
async def auth_and_correlation(request: Request, call_next) -> Response:
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    request.state.correlation_id = correlation_id

    path = request.url.path
    method = request.method

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    minute_bucket = int(time.time() // 60)
    is_auth_path = any(path.startswith(p) for p in _AUTH_PATHS)
    limit = _AUTH_LIMIT if is_auth_path else _GENERAL_LIMIT
    rl_key = f"rl:{client_ip}:{'auth' if is_auth_path else 'api'}:{minute_bucket}"
    try:
        allowed = await _check_rate_limit(request.app.state.redis, rl_key, limit)
        if not allowed:
            return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down."})
    except Exception:
        pass  # Don't block requests if Redis is unavailable

    # JWT validation — enforce on protected routes
    if not is_public(path, method):
        authorization = request.headers.get("Authorization")
        try:
            user_headers = extract_user_headers(authorization)
            if not user_headers:
                return JSONResponse(status_code=401, content={"detail": "Authentication required"})
        except ValueError as exc:
            return JSONResponse(status_code=401, content={"detail": str(exc)})
        # Attach parsed headers so the proxy can forward them
        request.state.user_headers = user_headers
    else:
        # On public routes, still decode the token if present (for personalized content)
        try:
            request.state.user_headers = extract_user_headers(request.headers.get("Authorization"))
        except ValueError:
            request.state.user_headers = {}

    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    response.headers["X-Correlation-ID"] = correlation_id
    logger.info("method=%s path=%s status=%d duration_ms=%.1f", method, path, response.status_code, elapsed)
    return response


@app.get("/health", tags=["ops"])
async def health():
    return {"status": "ok", "service": "gateway"}


@app.get("/ready", tags=["ops"])
async def ready(request: Request):
    try:
        await request.app.state.redis.ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    return {"status": "ready" if redis_ok else "degraded", "redis": redis_ok}


app.include_router(proxy_router)
