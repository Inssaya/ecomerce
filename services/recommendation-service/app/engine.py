import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import InteractionEvent, UserProfile, ViewEvent

logger = logging.getLogger(settings.service_name)

DWELL_WEIGHTS = {
    "short": (0, 5000, 0.5),
    "medium": (5000, 30000, 1.0),
    "long": (30000, float("inf"), 2.0),
}

EVENT_WEIGHTS = {
    "view": 1.0,
    "add_to_cart": 3.0,
    "purchase": 5.0,
}


def _dwell_weight(dwell_ms: int) -> float:
    for _, (lo, hi, w) in DWELL_WEIGHTS.items():
        if lo <= dwell_ms < hi:
            return w
    return 2.0


async def record_view(
    db: AsyncSession,
    user_ref: str,
    product_id: str,
    dwell_ms: int,
    category_id: str | None,
    label_ids: list[str],
    source: str = "product_page",
) -> None:
    event = ViewEvent(user_ref=user_ref, product_id=product_id, dwell_ms=dwell_ms, source=source)
    db.add(event)

    result = await db.execute(select(UserProfile).where(UserProfile.user_ref == user_ref))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_ref=user_ref, interests={}, last_viewed_products=[])
        db.add(profile)

    weight = _dwell_weight(dwell_ms)
    interests = dict(profile.interests or {})
    cats = interests.setdefault("categories", {})
    labels = interests.setdefault("labels", {})

    if category_id:
        cats[category_id] = round(cats.get(category_id, 0.0) + weight, 3)
    for lid in label_ids:
        labels[lid] = round(labels.get(lid, 0.0) + weight, 3)

    viewed = list(profile.last_viewed_products or [])
    if product_id in viewed:
        viewed.remove(product_id)
    viewed.insert(0, product_id)
    profile.last_viewed_products = viewed[:50]
    profile.interests = interests
    profile.total_events = (profile.total_events or 0) + 1
    await db.commit()


async def record_interaction(
    db: AsyncSession,
    user_ref: str,
    product_id: str,
    event_type: str,
) -> None:
    weight = EVENT_WEIGHTS.get(event_type, 1.0)
    event = InteractionEvent(
        user_ref=user_ref, product_id=product_id, event_type=event_type, weight=weight
    )
    db.add(event)
    await db.commit()


async def get_recommendations(
    db: AsyncSession, user_ref: str, catalog_client
) -> list[dict]:
    result = await db.execute(select(UserProfile).where(UserProfile.user_ref == user_ref))
    profile = result.scalar_one_or_none()

    scored: dict[str, float] = {}

    if profile and profile.interests:
        interests = profile.interests
        top_cats = sorted(
            interests.get("categories", {}).items(), key=lambda x: x[1], reverse=True
        )[:3]
        top_labels = sorted(
            interests.get("labels", {}).items(), key=lambda x: x[1], reverse=True
        )[:5]

        if top_cats:
            cat_filter = " OR ".join(f"category_id = {c}" for c, _ in top_cats)
            try:
                hits = await catalog_client.search("", filters=cat_filter, limit=20)
                for h in hits:
                    pid = h.get("id", "")
                    scored[pid] = scored.get(pid, 0.0) + 1.5

            except Exception as exc:
                logger.warning("Catalog search failed: %s", exc)

    # Trending boost
    trending = await get_trending(db)
    for i, pid in enumerate(trending[:10]):
        scored[pid] = scored.get(pid, 0.0) + (1.0 - i * 0.05)

    # Exclude already viewed
    viewed = set(profile.last_viewed_products[:10] if profile else [])
    final = [(pid, score) for pid, score in scored.items() if pid not in viewed]
    final.sort(key=lambda x: x[1], reverse=True)

    return [
        {"product_id": pid, "score": round(score, 3), "reason": "personalized"}
        for pid, score in final[: settings.max_recommendations]
    ]


async def get_trending(db: AsyncSession) -> list[str]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.trending_window_hours)
    result = await db.execute(
        select(ViewEvent.product_id, func.count().label("cnt"))
        .where(ViewEvent.created_at >= cutoff)
        .group_by(ViewEvent.product_id)
        .order_by(func.count().desc())
        .limit(settings.max_recommendations)
    )
    return [row[0] for row in result.all()]


async def get_similar(db: AsyncSession, product_id: str, catalog_client) -> list[str]:
    try:
        hits = await catalog_client.get_similar(product_id, limit=10)
        return [h.get("id", "") for h in hits if h.get("id") != product_id]
    except Exception:
        trending = await get_trending(db)
        return [p for p in trending if p != product_id][:10]
