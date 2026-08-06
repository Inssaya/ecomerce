"""One settings object for the whole application.

The eight services each carried their own `Settings` with overlapping fields
(jwt, redis, smtp, minio repeated eight times). There is one process now, so
there is one place to configure it.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "MoStyle"
    app_url: str = "http://localhost:3000"
    environment: str = "production"
    port: int = 8000

    database_url: str = "postgresql+asyncpg://mostyle:mostyle@postgres:5432/mostyle"
    redis_url: str = "redis://redis:6379/0"

    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # Object storage — product and piece photography.
    minio_endpoint: str = "minio:9000"
    minio_public_endpoint: str = "localhost:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_use_ssl: bool = False
    media_bucket: str = "media"

    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_from: str = "workshop@mostyle.ma"
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_tls: bool = False

    # The workshop's own contact point — used for the WhatsApp handoff.
    whatsapp_number: str = ""

    # Cash on delivery is the only payment method; Morocco, MAD.
    currency: str = "MAD"
    delivery_fee: float = 30.0
    free_delivery_over: float = 500.0

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
