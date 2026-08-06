"""The application.

One FastAPI app where there were eight services, a gateway, a message broker
and a search engine. What used to be a network hop between containers is now a
function call, and what used to be eight databases with string ids pointing
hopefully at each other is one database with foreign keys.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.config import settings
from app.core.cache import close_redis, get_redis
from app.core.llm import close_client
from app.core.storage import ensure_bucket
from app.db import engine
from app.modules.admin.routes import router as admin_router
from app.modules.ai.routes import router as ai_router
from app.modules.auth.routes import router as auth_router
from app.modules.catalog.routes import router as catalog_router
from app.modules.feed.routes import router as feed_router
from app.modules.notify.routes import router as notify_router
from app.modules.orders.routes import router as orders_router
from app.modules.requests.routes import router as requests_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("mostyle")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await ensure_bucket()
    except Exception as exc:
        # Not fatal. Photographs are served to the browser straight from object
        # storage, so the storefront keeps working and orders keep being taken
        # while it is unreachable; only uploads fail, and they fail loudly.
        logger.warning("Object storage is not reachable yet: %s", exc)
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

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(catalog_router)
api.include_router(orders_router)
api.include_router(requests_router)
api.include_router(feed_router)
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
