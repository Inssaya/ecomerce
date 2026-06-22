import logging
import sqlalchemy
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(settings.service_name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from app.storage import ensure_bucket
    from app.search import ensure_index

    await ensure_bucket(settings.media_bucket)
    await ensure_index()
    logger.info("%s started", settings.service_name)
    yield
    await engine.dispose()
    logger.info("%s shut down", settings.service_name)


app = FastAPI(
    title="Catalog Service",
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

from app.api.categories import router as categories_router
from app.api.labels import router as labels_router
from app.api.products import router as products_router
from app.api.media import router as media_router

app.include_router(categories_router)
app.include_router(labels_router)
app.include_router(products_router)
app.include_router(media_router)


@app.get("/health", tags=["ops"])
async def health():
    return {"status": "ok", "service": settings.service_name}


@app.get("/ready", tags=["ops"])
async def ready():
    try:
        async with engine.connect() as conn:
            await conn.execute(sqlalchemy.text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ready" if db_ok else "degraded", "service": settings.service_name, "database": db_ok}
