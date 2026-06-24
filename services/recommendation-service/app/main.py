import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base
from app.api.events import router as events_router
from app.api.recommendations import router as recs_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(settings.service_name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        # Tables are created by Alembic migrations in production;
        # create_all here is a convenience for dev/testing.
        await conn.run_sync(Base.metadata.create_all)
    logger.info("%s started", settings.service_name)
    yield
    await engine.dispose()
    logger.info("%s shut down", settings.service_name)


app = FastAPI(
    title="recommendation-service",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(events_router)
app.include_router(recs_router)


@app.get("/health", tags=["ops"])
async def health():
    return {"status": "ok", "service": settings.service_name}


@app.get("/ready", tags=["ops"])
async def ready():
    try:
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ready" if db_ok else "degraded",
        "service": settings.service_name,
        "database": db_ok,
    }
