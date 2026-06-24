from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas import KycReviewRequest

router = APIRouter(prefix="/kyc", tags=["kyc"])


def _require_admin(x_user_role: str | None):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/pending")
async def list_pending_kyc(
    page: int = 1,
    page_size: int = 20,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
) -> Any:
    _require_admin(x_user_role)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.auth_service_url}/kyc/pending",
            params={"page": page, "page_size": page_size},
            headers={"X-User-ID": x_user_id or "", "X-User-Role": "admin"},
        )
        resp.raise_for_status()
        return resp.json()


@router.put("/{kyc_id}/review")
async def review_kyc(
    kyc_id: str,
    body: KycReviewRequest,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
) -> Any:
    _require_admin(x_user_role)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.put(
            f"{settings.auth_service_url}/kyc/{kyc_id}/review",
            json=body.model_dump(),
            headers={"X-User-ID": x_user_id or "", "X-User-Role": "admin"},
        )
        resp.raise_for_status()
        return resp.json()
