import asyncio
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.engine import get_recommendations, get_similar, get_trending
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
