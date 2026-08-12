"""Signal ingestion.

Accepts a batch, because a page of 24 cards produces 24 impressions and 24
requests from a phone on mobile data is not acceptable. The frontend collects
them and posts once.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.limits import SignalLimit
from app.deps import DbSession, Lang, OptionalUser, Owner, Paging, Visitor
from app.models import FEED_WEIGHT_COPY, FeedWeight, Product, SignalType
from app.modules.catalog.schemas import ProductCard
from app.modules.catalog.service import to_card
from app.modules.feed import embeddings, engine, service

router = APIRouter(tags=["feed"])

MAX_BATCH = 60


class SignalIn(BaseModel):
    type: SignalType
    product_id: str | None = None
    category_id: str | None = None
    query: str | None = Field(default=None, max_length=200)
    #: `dwell`: seconds. `scroll_depth`: percent. `search`: results found.
    value: int | None = Field(default=None, ge=0, le=100_000)
    #: Which screen. Reduced to a known pattern server-side — see
    #: `service.clean_path` — so nothing that identifies one person can land
    #: in a table the whole panel reads.
    path: str | None = Field(default=None, max_length=200)


class SignalBatch(BaseModel):
    signals: list[SignalIn] = Field(min_length=1, max_length=MAX_BATCH)


@router.post("/signals", status_code=status.HTTP_202_ACCEPTED)
async def record_signals(
    body: SignalBatch, db: DbSession, user: OptionalUser, visitor: Visitor, _: SignalLimit
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
            path=item.path,
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
    return FeedPage(
        items=[to_card(product, lang) for product in products],
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


class PreviewItem(BaseModel):
    product_id: str
    title: str
    slug: str
    score: float
    terms: dict[str, float]


@router.get("/admin/feed/preview")
async def preview_feed(
    db: DbSession, owner: Owner, limit: int = Query(default=20, ge=1, le=60)
) -> dict:
    """What the shop is actually pushing, and why.

    Six sliders with no visible effect are six blind guesses, so this returns
    the current ranking with each term's contribution to the score.

    It is deliberately computed for a **visitor with no history**. The feed is
    personalised, so previewing it as the owner would show the owner's own
    feed — shaped by every piece they have opened while editing it — which is
    the one audience whose feed does not matter. A neutral visitor is what a
    stranger arriving at the shop sees.
    """
    coefficients = await engine.weights(db)
    scored = await engine.score_all(db, visitor_id="__preview__")
    top = sorted(scored, key=lambda item: item.score, reverse=True)[:limit]

    products = {
        product.id: product
        for product in await db.scalars(
            select(Product).where(Product.id.in_([item.product_id for item in top]))
        )
    }

    items = [
        PreviewItem(
            product_id=item.product_id,
            title=products[item.product_id].title_en if item.product_id in products else "—",
            slug=products[item.product_id].slug if item.product_id in products else "",
            score=round(item.score, 4),
            terms=dict(coefficients),
        )
        for item in top
        if item.product_id in products
    ]
    return {"visitor": "neutral", "weights": coefficients, "items": [item.model_dump() for item in items]}


@router.post("/admin/feed/embeddings")
async def refresh_embeddings(db: DbSession, owner: Owner, force: bool = False) -> dict:
    """Re-embed whatever has changed. Safe to run as often as you like — the
    pieces whose words have not changed are skipped."""
    return await embeddings.refresh(db, force=force)
