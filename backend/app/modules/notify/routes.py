"""The notification bell."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, update

from app.core.errors import get_or_404
from app.deps import CurrentUser, DbSession, Paging
from app.models import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    id: str
    kind: str
    title: str
    body: str
    payload: dict | None
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class Inbox(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread: int


@router.get("", response_model=Inbox)
async def inbox(user: CurrentUser, db: DbSession, paging: Paging) -> Inbox:
    mine = Notification.user_id == user.id
    total = await db.scalar(select(func.count()).select_from(Notification).where(mine)) or 0
    unread = (
        await db.scalar(
            select(func.count()).select_from(Notification).where(mine, Notification.read_at.is_(None))
        )
        or 0
    )
    rows = await db.scalars(
        select(Notification)
        .where(mine)
        .order_by(Notification.created_at.desc())
        .offset(paging.offset)
        .limit(paging.size)
    )
    return Inbox(items=list(rows), total=total, unread=unread)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(notification_id: str, user: CurrentUser, db: DbSession) -> Notification:
    notification = await get_or_404(
        db, Notification, notification_id, detail="Notification not found"
    )
    if notification.user_id != user.id:
        # Not 403: whether someone else's notification exists is not this
        # caller's business.
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.read_at = notification.read_at or datetime.now(UTC)
    await db.commit()
    await db.refresh(notification)
    return notification


@router.post("/read-all", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(user: CurrentUser, db: DbSession) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await db.commit()
