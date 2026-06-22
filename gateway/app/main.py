import logging
import time
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.routes.proxy import router as proxy_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("gateway")

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    logger.info("Gateway started — Redis connected")
    yield
    await app.state.redis.aclose()
    logger.info("Gateway shut down")


app = FastAPI(
    title="Ecomerce API Gateway",
    version="0.1.0",
    docs_url="/docs",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_correlation_id(request: Request, call_next) -> Response:
    import uuid
    correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    request.state.correlation_id = correlation_id
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    response.headers["X-Correlation-ID"] = correlation_id
    logger.info(
        "method=%s path=%s status=%d duration_ms=%.1f",
        request.method,
        request.url.path,
        response.status_code,
        elapsed,
    )
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
