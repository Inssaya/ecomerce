"""The application.

One FastAPI app where there were eight services, a gateway, a message broker
and a search engine. What used to be a network hop between containers is now a
function call, and what used to be eight databases with string ids pointing
hopefully at each other is one database with foreign keys.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.config import settings
from app.core.cache import close_redis, get_redis
from app.core.llm import close_client
from app.core.storage import ensure_bucket
from app.db import SessionLocal, engine
from app.modules.admin.routes import router as admin_router
from app.modules.ai.routes import router as ai_router
from app.modules.auth.routes import router as auth_router
from app.modules.catalog.routes import router as catalog_router
from app.modules.feed.routes import router as feed_router
from app.modules.local.routes import router as local_router
from app.modules.local.seed import seed as seed_local
from app.modules.notify.routes import router as notify_router
from app.modules.orders.routes import router as orders_router
from app.modules.requests.routes import router as requests_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("mostyle")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.check()
    try:
        await ensure_bucket()
    except Exception as exc:
        # Not fatal. Photographs are served to the browser straight from object
        # storage, so the storefront keeps working and orders keep being taken
        # while it is unreachable; only uploads fail, and they fail loudly.
        logger.warning("Object storage is not reachable yet: %s", exc)

    # The cities we deliver to and the services we offer are content, and a
    # deployment with neither has no local pages at all. Seeding here means a
    # fresh install is complete without anybody remembering a command; it only
    # ever inserts what is missing, so the owner's edits are never overwritten.
    try:
        async with SessionLocal() as db:
            added_cities, added_services = await seed_local(db)
        if added_cities or added_services:
            logger.info("Seeded %s cities and %s services", added_cities, added_services)
    except Exception as exc:
        # Same reasoning as storage: a shop that will not start because a
        # landing page is missing is worse than a shop without that page.
        logger.warning("Could not seed cities and services: %s", exc)

    logger.info("%s API ready", settings.app_name)
    yield
    await close_redis()
    await close_client()
    await engine.dispose()


app = FastAPI(
    title=f"{settings.app_name} API",
    version="2.0.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# Same origin in production (nginx serves both), so CORS only needs to permit
# the Next.js dev server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.app_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# 99% of buyers are on a phone, often on mobile data: compress everything.
app.add_middleware(GZipMiddleware, minimum_size=512)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Headers the browser enforces for us.

    This API answers a storefront and nothing else, so the policy can be far
    tighter than a general-purpose one: it never renders HTML, never needs to
    be framed, and never needs to be reachable from another origin's page.
    """
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()"
    )
    # JSON only: nothing this API returns should ever be executed or framed.
    response.headers.setdefault(
        "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
    )
    # An order reference or a tracking token must never travel in the clear.
    if settings.is_production:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(catalog_router)
api.include_router(orders_router)
api.include_router(requests_router)
api.include_router(feed_router)
api.include_router(local_router)
api.include_router(notify_router)
api.include_router(admin_router)
api.include_router(ai_router)
app.include_router(api)


@app.get("/health", tags=["ops"])
async def health() -> dict:
    return {"status": "ok"}


@app.get("/ready", tags=["ops"])
async def ready() -> dict:
    """Readiness means the two things a request actually needs."""
    checks: dict[str, bool] = {}
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        checks["database"] = False
    try:
        await get_redis().ping()
        checks["redis"] = True
    except Exception:
        checks["redis"] = False
    return {"status": "ready" if all(checks.values()) else "degraded", **checks}
