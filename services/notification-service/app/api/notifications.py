from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.database import get_db
from app.models import Notification
from app.schemas import NotificationPage, NotificationResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/inbox", response_model=NotificationPage)
async def get_inbox(
    page: int = 1,
    page_size: int = 20,
    x_user_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    offset = (page - 1) * page_size
    total_result = await db.execute(
        select(func.count()).where(Notification.user_id == x_user_id)
    )
    total = total_result.scalar() or 0

    unread_result = await db.execute(
        select(func.count()).where(
            Notification.user_id == x_user_id,
            Notification.read_at.is_(None),
            Notification.channel == "in_app",
        )
    )
    unread = unread_result.scalar() or 0

    items_result = await db.execute(
        select(Notification)
        .where(Notification.user_id == x_user_id, Notification.channel == "in_app")
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = items_result.scalars().all()

    return NotificationPage(items=items, total=total, unread=unread)


@router.put("/inbox/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: str,
    x_user_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notif.user_id != x_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    notif.read_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(notif)
    return notif


@router.put("/inbox/read-all")
async def mark_all_read(
    x_user_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    now = datetime.now(timezone.utc)
    await db.execute(
        update(Notification)
        .where(Notification.user_id == x_user_id, Notification.read_at.is_(None))
        .values(read_at=now)
    )
    await db.commit()
    return {"detail": "All notifications marked as read"}
