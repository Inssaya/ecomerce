from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException

from app.config import settings
from app.schemas import UserStatusUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _require_admin(x_user_role: str | None):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/")
async def list_users(
    page: int = 1,
    page_size: int = 20,
    role: str | None = None,
    status: str | None = None,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
) -> Any:
    _require_admin(x_user_role)
    params: dict = {"page": page, "page_size": page_size}
    if role:
        params["role"] = role
    if status:
        params["status"] = status
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.auth_service_url}/users",
            params=params,
            headers={"X-User-ID": x_user_id or "", "X-User-Role": "admin"},
        )
        resp.raise_for_status()
        return resp.json()


@router.put("/{user_id}/status")
async def update_user_status(
    user_id: str,
    body: UserStatusUpdate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
) -> Any:
    _require_admin(x_user_role)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.put(
            f"{settings.auth_service_url}/users/{user_id}/status",
            json=body.model_dump(),
            headers={"X-User-ID": x_user_id or "", "X-User-Role": "admin"},
        )
        resp.raise_for_status()
        return resp.json()


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
) -> Any:
    _require_admin(x_user_role)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{settings.auth_service_url}/users/{user_id}",
            headers={"X-User-ID": x_user_id or "", "X-User-Role": "admin"},
        )
        resp.raise_for_status()
        return resp.json()
