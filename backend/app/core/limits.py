"""Rate limiting.

Nothing here was limited before, and the endpoints that need it most are the
ones that have to stay open to strangers:

* **`/auth/login`** — the owner's password is the whole shop. Unlimited guesses
  against an 8-character minimum is not a password policy, it is a delay.
* **`/assistant`** — unauthenticated, and every call spends money at an AI
  provider. Someone who found it could empty the API budget in an afternoon.
* **`/orders`** and **`/requests`** — a script could fill the workshop's day
  with fake orders, and each fake order *reserves real pieces*, so the shop
  would show as sold out while nothing had been sold.
* **`/forgot-password`** — otherwise it is a free email cannon pointed at
  anyone whose address you know.

A fixed window in Redis, not a token bucket: it is one process talking to one
Redis, the traffic is a single small shop, and a counter with an expiry is
something anybody can reason about at 2am.

**It fails open.** If Redis is unreachable the request is allowed and the
failure is logged loudly. For a shop that is the right trade — a limiter
outage must not become an outage.
"""
import logging
from contextlib import suppress
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.cache import get_redis

logger = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    """The caller's address, trusting exactly one proxy hop.

    nginx sits in front and sets `X-Forwarded-For`. Taking the *first* entry
    would trust whatever the client put there, so we take the last one, which
    is the only value our own proxy controls.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


class RateLimit:
    """A dependency: `Depends(RateLimit(5, 60))`.

    `by` decides what is counted. `ip` is the default; `body:<field>` counts
    per value of a JSON field, which is how login is limited per account as
    well as per address — otherwise one attacker rotating addresses gets
    unlimited guesses at a single password.
    """

    def __init__(self, times: int, seconds: int, *, by: str = "ip", name: str | None = None):
        self.times = times
        self.seconds = seconds
        self.by = by
        self.name = name

    async def _identity(self, request: Request) -> str | None:
        if self.by == "ip":
            return client_ip(request)
        if self.by.startswith("body:"):
            field = self.by.split(":", 1)[1]
            try:
                # Starlette caches the body, so reading it here does not stop
                # the endpoint from parsing it afterwards.
                payload = await request.json()
            except Exception:
                return None
            value = payload.get(field) if isinstance(payload, dict) else None
            return str(value).lower().strip() if value else None
        return client_ip(request)

    async def __call__(self, request: Request) -> None:
        identity = await self._identity(request)
        if identity is None:
            return

        bucket = self.name or request.scope.get("route").path  # type: ignore[union-attr]
        key = f"rl:{bucket}:{self.by}:{identity}"

        try:
            redis = get_redis()
            used = await redis.incr(key)
            if used == 1:
                await redis.expire(key, self.seconds)
            remaining = await redis.ttl(key) if used > self.times else 0
        except Exception as exc:
            # Fail open: a limiter outage must not become a shop outage.
            logger.error("Rate limiter unavailable, allowing request: %s", exc)
            return

        if used > self.times:
            wait = max(remaining, 1)
            await self._record(request, identity, bucket, used)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts — wait a moment and try again",
                headers={"Retry-After": str(wait)},
            )

    #: A trip against the owner's own password is a different story than a
    #: trip against `/signals` — the first is a real attack signal, the
    #: second is closer to a slipped keypress at scale.
    _DANGER_BUCKETS = {"signin", "signin-acct", "reset", "reset-acct", "register"}

    async def _record(self, request: Request, identity: str, bucket: str, used: int) -> None:
        """Feed the Logs door. Its own session, its own failure boundary —
        logging a rate-limit trip must never be the reason the 429 fails to
        return."""
        from app.db import SessionLocal
        from app.models import SecurityLevel
        from app.modules.security import service as security_service

        level = SecurityLevel.danger if bucket in self._DANGER_BUCKETS else SecurityLevel.warn
        try:
            async with SessionLocal() as db:
                await security_service.log(
                    db,
                    level=level,
                    kind="rate_limit",
                    message=f"'{bucket}' tripped by {self.by}={identity} ({used}/{self.times} in {self.seconds}s)",
                    ip=client_ip(request),
                    # Every limit today is keyed `by="ip"` or `by="body:<field>"` —
                    # never a fingerprint — so there is no visitor id to attach yet.
                    visitor_id=None,
                    meta={"bucket": bucket, "by": self.by, "times": self.times, "seconds": self.seconds, "used": used},
                )
        except Exception as exc:
            logger.error("Could not record rate-limit trip: %s", exc)


async def clear(bucket: str, by: str, identity: str) -> None:
    """Forget the count. Called after a *successful* sign-in, so someone who
    mistyped their password four times is not still being counted an hour
    later."""
    with suppress(Exception):
        await get_redis().delete(f"rl:{bucket}:{by}:{identity.lower().strip()}")


# Named limits, so the numbers live in one place and can be argued about.
# Generous enough that a real person on a phone never meets them.
SignInLimit = Annotated[None, Depends(RateLimit(8, 300, name="signin"))]
SignInPerAccount = Annotated[None, Depends(RateLimit(6, 900, by="body:email", name="signin-acct"))]
RegisterLimit = Annotated[None, Depends(RateLimit(5, 3600, name="register"))]
ResetLimit = Annotated[None, Depends(RateLimit(4, 3600, name="reset"))]
ResetPerAccount = Annotated[None, Depends(RateLimit(3, 3600, by="body:email", name="reset-acct"))]
CheckoutLimit = Annotated[None, Depends(RateLimit(10, 600, name="checkout"))]
RequestLimit = Annotated[None, Depends(RateLimit(6, 600, name="custom-request"))]
#: Reference photos on a custom request. Six per request, and a person who
#: rephotographs a sketch a few times should not be stopped — but this is the
#: one endpoint a stranger can write bytes to, so it is the one that must not
#: be a free file host.
ReferenceUploadLimit = Annotated[None, Depends(RateLimit(20, 900, name="reference-upload"))]
AssistantLimit = Annotated[None, Depends(RateLimit(30, 600, name="assistant"))]
SignalLimit = Annotated[None, Depends(RateLimit(120, 60, name="signals"))]
LookupLimit = Annotated[None, Depends(RateLimit(15, 600, name="lookup"))]
ContactLimit = Annotated[None, Depends(RateLimit(6, 600, name="contact"))]
