"""Signal ingestion.

Accepts a batch, because a page of 24 cards produces 24 impressions and 24
requests from a phone on mobile data is not acceptable. The frontend collects
them and posts once.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import DbSession, OptionalUser, Visitor
from app.models import SignalType
from app.modules.feed import service

router = APIRouter(tags=["feed"])

MAX_BATCH = 60


class SignalIn(BaseModel):
    type: SignalType
    product_id: str | None = None
    category_id: str | None = None
    query: str | None = Field(default=None, max_length=200)
    #: `dwell`: seconds. `scroll_depth`: percent.
    value: int | None = Field(default=None, ge=0, le=100_000)


class SignalBatch(BaseModel):
    signals: list[SignalIn] = Field(min_length=1, max_length=MAX_BATCH)


@router.post("/signals", status_code=status.HTTP_202_ACCEPTED)
async def record_signals(
    body: SignalBatch, db: DbSession, user: OptionalUser, visitor: Visitor
) -> dict:
    """Anonymous by default — most buyers never sign in, so the fingerprint is
    the identity that matters. When there is an account too, both are stored,
    so signing in later keeps the history."""
    if not visitor:
        raise HTTPException(
            status_code=400, detail="Missing visitor id"
        )

    recorded = 0
    for item in body.signals:
        signal = await service.record(
            db,
            visitor_id=visitor,
            user_id=user.id if user else None,
            signal_type=item.type,
            product_id=item.product_id,
            category_id=item.category_id,
            query=item.query,
            value=item.value,
        )
        recorded += signal is not None
    await db.commit()
    return {"recorded": recorded}
