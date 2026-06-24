from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException

from app.config import settings
from app.schemas import MetricsResponse

router = APIRouter(prefix="/metrics", tags=["metrics"])


def _require_admin(x_user_role: str | None):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/", response_model=MetricsResponse)
async def platform_metrics(
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
) -> Any:
    _require_admin(x_user_role)

    headers = {"X-User-ID": x_user_id or "", "X-User-Role": "admin"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        results = await _fetch_all(client, headers)

    return results


async def _fetch_all(client: httpx.AsyncClient, headers: dict) -> dict:
    import asyncio

    async def _get(url: str, default: Any = None) -> Any:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return default

    users_data, orders_data, sellers_data, delivery_data = await asyncio.gather(
        _get(f"{settings.auth_service_url}/users/stats", {}),
        _get(f"{settings.order_service_url}/orders/stats", {}),
        _get(f"{settings.seller_service_url}/analytics/stats", {}),
        _get(f"{settings.delivery_service_url}/assignments/stats", {}),
    )

    return MetricsResponse(
        total_users=users_data.get("total", 0),
        active_sellers=sellers_data.get("active_sellers", 0),
        pending_kyc=users_data.get("pending_kyc", 0),
        total_orders=orders_data.get("total", 0),
        orders_today=orders_data.get("today", 0),
        total_revenue=orders_data.get("revenue", 0.0),
        pending_deliveries=delivery_data.get("pending", 0),
    )


@router.get("/orders")
async def admin_orders(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
) -> Any:
    _require_admin(x_user_role)
    params: dict = {"page": page, "page_size": page_size}
    if status:
        params["status"] = status
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.order_service_url}/orders",
            params=params,
            headers={"X-User-ID": x_user_id or "", "X-User-Role": "admin"},
        )
        resp.raise_for_status()
        return resp.json()
