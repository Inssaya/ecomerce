"""Signal ingestion.

Accepts a batch, because a page of 24 cards produces 24 impressions and 24
requests from a phone on mobile data is not acceptable. The frontend collects
them and posts once.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import DbSession, Lang, OptionalUser, Owner, Paging, Visitor
from app.models import FEED_WEIGHT_COPY, FeedWeight, SignalType
from app.modules.catalog.schemas import ProductCard
from app.modules.catalog.service import availability, to_card
from app.modules.feed import embeddings, engine, service

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


class FeedPage(BaseModel):
    items: list[ProductCard]
    page: int
    size: int
    has_more: bool
    #: How much of this page is discovery rather than what we think you like.
    #: Surfaced so the panel can show what the feed is doing, not to be shown
    #: to the buyer — nobody wants to be told they are being profiled.
    explore_ratio: float


@router.get("/feed", response_model=FeedPage)
async def feed(db: DbSession, lang: Lang, paging: Paging, visitor: Visitor) -> FeedPage:
    """The store, reshaped around whoever is looking at it.

    Each request re-reads fresh signals, so scrolling is a conversation with
    the store rather than pagination through a fixed list.
    """
    # Someone with no fingerprint yet — a first paint, or a locked-down browser
    # — gets a stable pseudo-visitor rather than an error. They see the broad
    # page, which is exactly right for someone we know nothing about.
    products, ratio, total = await engine.page(
        db, visitor_id=visitor or "anonymous", size=paging.size, offset=paging.offset
    )
    left = await availability(db, [product.id for product in products])
    return FeedPage(
        items=[to_card(product, lang, left.get(product.id, 0)) for product in products],
        page=paging.page,
        size=paging.size,
        has_more=paging.offset + len(products) < total,
        explore_ratio=round(ratio, 3),
    )


# ── Owner: the levers ─────────────────────────────────────────────────────────


class WeightOut(BaseModel):
    key: str
    value: float
    explains: str


class WeightUpdate(BaseModel):
    key: str
    value: float = Field(ge=0, le=5)


@router.get("/admin/feed/weights", response_model=list[WeightOut])
async def read_weights(db: DbSession, owner: Owner, lang: Lang) -> list[WeightOut]:
    """What the feed is currently weighing, in words the owner can act on."""
    current = await engine.weights(db)
    return [
        WeightOut(
            key=key,
            value=value,
            explains=FEED_WEIGHT_COPY[key][1 if lang == "ar" else 0],
        )
        for key, value in current.items()
        if key in FEED_WEIGHT_COPY
    ]


@router.put("/admin/feed/weights", response_model=list[WeightOut])
async def set_weights(
    body: list[WeightUpdate], db: DbSession, owner: Owner, lang: Lang
) -> list[WeightOut]:
    known = set(FEED_WEIGHT_COPY)
    unknown = {item.key for item in body} - known
    if unknown:
        raise HTTPException(status_code=400, detail=f"Not a feed weight: {', '.join(sorted(unknown))}")

    await engine.weights(db)  # ensure the rows exist before updating them
    for item in body:
        row = await db.get(FeedWeight, item.key)
        if row is not None:
            row.value = item.value
    await db.commit()
    return await read_weights(db, owner, lang)


@router.post("/admin/feed/embeddings")
async def refresh_embeddings(db: DbSession, owner: Owner, force: bool = False) -> dict:
    """Re-embed whatever has changed. Safe to run as often as you like — the
    pieces whose words have not changed are skipped."""
    return await embeddings.refresh(db, force=force)
