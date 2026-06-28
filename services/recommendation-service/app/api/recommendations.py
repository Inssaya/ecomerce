import asyncio
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.engine import get_recommendations, get_similar, get_trending
from app.models import InteractionEvent, ViewEvent
from app.schemas import RecommendationsResponse, TrendingResponse

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


class _CatalogClient:
    """Thin async wrapper around catalog-service Meilisearch search endpoint."""

    def __init__(self):
        self._base = settings.catalog_service_url

    async def search(self, q: str, filters: str = "", limit: int = 20) -> list[dict]:
        params = {"q": q, "limit": limit}
        if filters:
            params["filters"] = filters
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{self._base}/products/search", params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("hits", [])

    async def get_similar(self, product_id: str, limit: int = 10) -> list[dict]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{self._base}/products", params={"limit": limit})
            resp.raise_for_status()
            items = resp.json().get("items", [])
            return [p for p in items if p.get("id") != product_id][:limit]


_catalog = _CatalogClient()


def _user_ref(x_user_id: Optional[str], x_guest_id: Optional[str]) -> str:
    if x_user_id:
        return f"user:{x_user_id}"
    return f"guest:{x_guest_id or 'anonymous'}"


@router.get("/", response_model=RecommendationsResponse)
async def recommendations(
    x_user_id: Optional[str] = Header(default=None),
    x_guest_id: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    user_ref = _user_ref(x_user_id, x_guest_id)
    items = await get_recommendations(db, user_ref, _catalog)
    return RecommendationsResponse(user_ref=user_ref, items=items)


@router.get("/trending", response_model=TrendingResponse)
async def trending(db: AsyncSession = Depends(get_db)):
    product_ids = await get_trending(db)
    return TrendingResponse(product_ids=product_ids, window_hours=settings.trending_window_hours)


@router.get("/similar/{product_id}", response_model=list[str])
async def similar(product_id: str, db: AsyncSession = Depends(get_db)):
    return await get_similar(db, product_id, _catalog)


@router.get("/admin/stats")
async def admin_stats(
    x_user_role: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    total_views = await db.scalar(select(func.count()).select_from(ViewEvent)) or 0
    unique_visitors_alltime = (
        await db.scalar(select(func.count(distinct(ViewEvent.user_ref))).select_from(ViewEvent))
    ) or 0
    today_views = (
        await db.scalar(
            select(func.count()).select_from(ViewEvent).where(ViewEvent.created_at >= today_start)
        )
    ) or 0
    today_unique_visitors = (
        await db.scalar(
            select(func.count(distinct(ViewEvent.user_ref)))
            .select_from(ViewEvent)
            .where(ViewEvent.created_at >= today_start)
        )
    ) or 0

    top_result = await db.execute(
        select(ViewEvent.product_id, func.count().label("views"))
        .group_by(ViewEvent.product_id)
        .order_by(func.count().desc())
        .limit(10)
    )
    top_products = [{"product_id": row[0], "views": row[1]} for row in top_result]

    add_to_cart = (
        await db.scalar(
            select(func.count())
            .select_from(InteractionEvent)
            .where(InteractionEvent.event_type == "add_to_cart")
        )
    ) or 0
    purchases = (
        await db.scalar(
            select(func.count())
            .select_from(InteractionEvent)
            .where(InteractionEvent.event_type == "purchase")
        )
    ) or 0

    return {
        "total_views": total_views,
        "unique_visitors_alltime": unique_visitors_alltime,
        "today_views": today_views,
        "today_unique_visitors": today_unique_visitors,
        "top_products": top_products,
        "add_to_cart_events": add_to_cart,
        "purchase_events": purchases,
    }
