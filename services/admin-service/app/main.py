import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.kyc import router as kyc_router
from app.api.users import router as users_router
from app.api.metrics import router as metrics_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(settings.service_name)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("%s started", settings.service_name)
    yield
    logger.info("%s shut down", settings.service_name)


app = FastAPI(
    title="admin-service",
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


app.include_router(kyc_router)
app.include_router(users_router)
app.include_router(metrics_router)


@app.get("/health", tags=["ops"])
async def health():
    return {"status": "ok", "service": settings.service_name}


@app.get("/ready", tags=["ops"])
async def ready():
    return {"status": "ready", "service": settings.service_name}
