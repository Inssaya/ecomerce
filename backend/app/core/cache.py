"""One Redis connection pool for the process.

The old services each opened a connection per request and closed it in a
`finally` block. One app means one pool, created at startup and closed at
shutdown.
"""
from __future__ import annotations

import redis.asyncio as redis

from app.config import settings

_pool: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _pool
    if _pool is None:
        _pool = redis.from_url(settings.redis_url, decode_responses=True)
    return _pool


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
