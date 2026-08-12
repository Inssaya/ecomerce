"""The Logs door's API — deliberately small.

Four endpoints: read the log, read one event, block, unblock. Nothing here
aggregates or charts anything — the owner asked for the page to be simple,
and the API matches it.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.core.errors import get_or_404
from app.deps import DbSession, Owner
from app.models import Blocklist, SecurityEvent, SecurityLevel
from app.modules.security import service
from app.modules.security.schemas import BlockCreate, BlockOut, SecurityEventOut

router = APIRouter(prefix="/admin/security", tags=["security"])


@router.get("/logs", response_model=list[SecurityEventOut])
async def list_events(
    db: DbSession,
    owner: Owner,
    level: SecurityLevel | None = Query(default=None),
    since: datetime | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[SecurityEvent]:
    query = select(SecurityEvent)
    if level is not None:
        query = query.where(SecurityEvent.level == level)
    if since is not None:
        query = query.where(SecurityEvent.created_at >= since)
    rows = await db.scalars(query.order_by(SecurityEvent.created_at.desc()).limit(limit))
    return list(rows)


@router.get("/events/{event_id}", response_model=SecurityEventOut)
async def get_event(event_id: str, db: DbSession, owner: Owner) -> SecurityEvent:
    """The fingerprint drill-in: everything one event recorded, for deciding
    whether to block whoever caused it."""
    return await get_or_404(db, SecurityEvent, event_id, detail="Event not found")


@router.get("/blocklist", response_model=list[BlockOut])
async def list_blocks(db: DbSession, owner: Owner) -> list[Blocklist]:
    rows = await db.scalars(
        select(Blocklist).where(Blocklist.active.is_(True)).order_by(Blocklist.created_at.desc())
    )
    return list(rows)


@router.post("/block", response_model=list[BlockOut], status_code=status.HTTP_201_CREATED)
async def block(body: BlockCreate, db: DbSession, owner: Owner) -> list[Blocklist]:
    return await service.create_block(db, reason=body.reason, visitor_id=body.visitor_id, ip=body.ip)


@router.delete("/block/{block_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def unblock(block_id: str, db: DbSession, owner: Owner) -> None:
    entry = await get_or_404(db, Blocklist, block_id, detail="Block not found")
    await service.remove_block(db, entry)
