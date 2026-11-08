"""Database engine, session factory and the declarative base.

One database, so relationships are real foreign keys and joins are joins —
the cross-service HTTP calls the old architecture needed for the same data
are gone.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    # Supabase's pooled connection (port 6543) is PgBouncer in transaction
    # mode: the next statement may land on a different server connection than
    # the one that prepared it. asyncpg caches prepared statements by default,
    # so about one request in three died with "prepared statement does not
    # exist". No cache, and unique names for the statements it does prepare.
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    },
)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Request-scoped session. Rolls back on an unhandled error so a failed
    request can never leave a half-applied write behind."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
