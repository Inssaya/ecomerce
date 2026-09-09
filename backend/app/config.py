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

    # ── Identity ──────────────────────────────────────────────────────────────
    #
    # Supabase issues the tokens; this application only verifies them. There is
    # no signing secret here on purpose: the project signs with ES256, so what
    # is needed to check a token is the *public* half, fetched from the JWKS
    # endpoint below. Nothing this app holds could mint a session.
    supabase_url: str = ""
    #: The publishable ("anon") key. Safe in a browser and safe here — it
    #: identifies the project on unauthenticated endpoints and grants nothing
    #: on its own.
    supabase_anon_key: str = ""

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

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
    #: Delivery is free on everything. Both numbers are kept as settings rather
    #: than deleted because the shop may want to charge again one day, and a
    #: threshold is a cheaper thing to change than a code path — but while
    #: `free_delivery_over` is zero, every order clears it and nobody is ever
    #: charged for delivery, whatever a city's own override says.
    delivery_fee: float = 0.0
    free_delivery_over: float = 0.0

    @property
    def delivery_is_free(self) -> bool:
        """True while every possible order clears the free-delivery threshold.

        The per-city override exists for places that genuinely cost more to
        reach, and it is published on that city's page. Under a free-for-
        everything policy it would be published and never charged — the page
        saying 30 and the courier asking for nothing. One number, so it is
        suppressed at the source rather than in each of the five places that
        print it.
        """
        return self.free_delivery_over <= 0

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def check(self) -> None:
        """Refuse to start with a configuration that only looks like security.

        This used to guard `JWT_SECRET`, because an empty one signed every
        token with the empty string and anybody could mint an owner session in
        one line. There is no signing secret any more — Supabase issues tokens
        and this application only ever verifies them against a public key — so
        what has to be true instead is that we know *which* project to trust.
        An empty `SUPABASE_URL` means no issuer to check against and no JWKS to
        fetch, so every request would arrive unauthenticated.
        """
        if self.supabase_url:
            return
        message = "SUPABASE_URL must be set — it is the issuer whose tokens this app trusts"
        if self.is_production:
            raise RuntimeError(message)
        logging.getLogger(__name__).warning("%s — running anyway outside production", message)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
