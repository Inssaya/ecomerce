"""The shop's own watchman.

Three jobs: write a row when something is worth knowing, tell the owner by
email when it is a `danger`, and enforce the blocklist cheaply on every
request. All three follow the same rule the rate limiter already set: this
must never be the reason the shop goes down. A logging call that fails does
not fail the request it was called from; a blocklist check that fails allows
the request through.
"""
from __future__ import annotations

import logging
from contextlib import suppress
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import get_redis
from app.models import Blocklist, SecurityEvent, SecurityLevel
from app.modules.notify.email import send_email

logger = logging.getLogger(__name__)

#: Who hears about a `danger` event. Fixed addresses, not configuration —
#: the owner asked for these two specifically.
ALERT_RECIPIENTS = ("yassinsinif4@gmail.com", "Yassine.Sinif@emsi-edu.ma")

#: An IP block always expires — an address can be a whole café, and a
#: permanent ban there punishes strangers. A fingerprint block does not.
IP_BLOCK_HOURS = 24

#: How long one (kind, ip) pair stays quiet after alerting once. A flood is
#: one story, not one email per request in it.
ALERT_DEBOUNCE_SECONDS = 900

#: D12 — danger is kept forever; warn and info age out on a schedule nobody
#: has to run by hand.
RETENTION_DAYS = {SecurityLevel.warn: 90, SecurityLevel.info: 30}

_BLOCK_IP_KEY = "block:ip:"
_BLOCK_VISITOR_KEY = "block:visitor:"


async def log(
    db: AsyncSession,
    *,
    level: SecurityLevel,
    kind: str,
    message: str,
    ip: str | None = None,
    visitor_id: str | None = None,
    user_id: str | None = None,
    meta: dict | None = None,
) -> SecurityEvent:
    event = SecurityEvent(
        level=level, kind=kind, message=message, ip=ip, visitor_id=visitor_id,
        user_id=user_id, meta=meta,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    if level is SecurityLevel.danger:
        await _alert(event)
    return event


async def _alert(event: SecurityEvent) -> None:
    """Email the owner. Debounced so a flood is one email, not one per hit."""
    debounce_key = f"sec-alert:{event.kind}:{event.ip or event.visitor_id or 'unknown'}"
    try:
        redis = get_redis()
        # NX: only the first caller in the window gets `True` back.
        first = await redis.set(debounce_key, "1", nx=True, ex=ALERT_DEBOUNCE_SECONDS)
        if not first:
            return
    except Exception as exc:
        # Redis being down should not be the reason a real attack goes
        # unreported — send anyway rather than staying quiet.
        logger.error("Alert debounce unavailable, sending anyway: %s", exc)

    subject = f"[M-Style] {event.kind}"
    html = (
        f"<p><strong>{event.kind}</strong></p>"
        f"<p>{event.message}</p>"
        f"<p style='color:#777;font-size:13px'>"
        f"IP: {event.ip or '—'} · Visitor: {event.visitor_id or '—'} · "
        f"{event.created_at.isoformat() if event.created_at else ''}</p>"
    )
    for recipient in ALERT_RECIPIENTS:
        with suppress(Exception):
            await send_email(recipient, subject, html)


async def prune(db: AsyncSession) -> int:
    """Age out `info` and `warn` rows. `danger` is never pruned. Runs at
    startup, the same non-fatal way the local-content seed does — a shop that
    fails to boot because housekeeping errored is the wrong trade."""
    removed = 0
    for level, days in RETENTION_DAYS.items():
        cutoff = datetime.now(UTC) - timedelta(days=days)
        rows = list(
            await db.scalars(
                select(SecurityEvent).where(
                    SecurityEvent.level == level, SecurityEvent.created_at < cutoff
                )
            )
        )
        for row in rows:
            await db.delete(row)
        removed += len(rows)
    if removed:
        await db.commit()
    return removed


# ── Blocklist ────────────────────────────────────────────────────────────────


async def _cache_block(entry: Blocklist) -> None:
    """Mirror a block into Redis, which is what the request path actually
    reads — see `is_blocked`."""
    with suppress(Exception):
        redis = get_redis()
        if entry.ip:
            ttl = None
            if entry.expires_at:
                ttl = max(1, int((entry.expires_at - datetime.now(UTC)).total_seconds()))
            await redis.set(f"{_BLOCK_IP_KEY}{entry.ip}", "1", ex=ttl)
        if entry.visitor_id:
            await redis.set(f"{_BLOCK_VISITOR_KEY}{entry.visitor_id}", "1")


async def _uncache_block(entry: Blocklist) -> None:
    with suppress(Exception):
        redis = get_redis()
        if entry.ip:
            await redis.delete(f"{_BLOCK_IP_KEY}{entry.ip}")
        if entry.visitor_id:
            await redis.delete(f"{_BLOCK_VISITOR_KEY}{entry.visitor_id}")


async def create_block(
    db: AsyncSession, *, reason: str, visitor_id: str | None, ip: str | None
) -> list[Blocklist]:
    """One block action can produce up to two rows — a permanent one for the
    fingerprint, a 24-hour one for the address — because the two lifetimes
    cannot share a row. Both, one, or the caller gets a 400."""
    created: list[Blocklist] = []
    if visitor_id:
        entry = Blocklist(reason=reason, visitor_id=visitor_id, expires_at=None)
        db.add(entry)
        created.append(entry)
    if ip:
        entry = Blocklist(
            reason=reason, ip=ip, expires_at=datetime.now(UTC) + timedelta(hours=IP_BLOCK_HOURS)
        )
        db.add(entry)
        created.append(entry)
    if not created:
        return created
    await db.commit()
    for entry in created:
        await db.refresh(entry)
        await _cache_block(entry)
    return created


async def remove_block(db: AsyncSession, entry: Blocklist) -> None:
    await _uncache_block(entry)
    await db.delete(entry)
    await db.commit()


async def is_blocked(*, ip: str | None, visitor_id: str | None) -> bool:
    """The request-path check. Redis only — no database round trip on every
    request — and fails open exactly like `RateLimit` does: a check that
    cannot run must never become an outage."""
    try:
        redis = get_redis()
        if ip and await redis.exists(f"{_BLOCK_IP_KEY}{ip}"):
            return True
        if visitor_id and await redis.exists(f"{_BLOCK_VISITOR_KEY}{visitor_id}"):
            return True
        return False
    except Exception as exc:
        logger.error("Blocklist check unavailable, allowing request: %s", exc)
        return False
