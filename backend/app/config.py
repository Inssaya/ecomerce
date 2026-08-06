"""One settings object for the whole application.

The eight services each carried their own `Settings` with overlapping fields
(jwt, redis, smtp, minio repeated eight times). There is one process now, so
there is one place to configure it.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

#: Short enough to type, long enough that guessing it is not a strategy.
MIN_SECRET_LENGTH = 32


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

    # ── AI ──
    # Any OpenAI-compatible endpoint. Empty key means every AI feature reports
    # itself unavailable rather than degrading to a guess.
    llm_api_key: str = ""
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"

    # Cash on delivery is the only payment method; Morocco, MAD.
    currency: str = "MAD"
    delivery_fee: float = 30.0
    free_delivery_over: float = 500.0

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def check(self) -> None:
        """Refuse to start with a configuration that only looks like security.

        An empty `JWT_SECRET` signs every token with the empty string, which
        means anyone can mint an owner token in one line. It defaults to empty
        so tests and local runs work; production must not inherit that.
        """
        if self.jwt_secret and len(self.jwt_secret) >= MIN_SECRET_LENGTH:
            return
        message = (
            f"JWT_SECRET must be set and at least {MIN_SECRET_LENGTH} characters "
            "(openssl rand -hex 64)"
        )
        if self.is_production:
            raise RuntimeError(message)
        logging.getLogger(__name__).warning("%s — running anyway outside production", message)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
