from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.engine import record_interaction, record_view
from app.schemas import InteractionEventCreate, ViewEventCreate, ViewEventResponse

router = APIRouter(prefix="/events", tags=["events"])


def _get_user_ref(x_user_id: str | None, guest_id: str | None) -> str:
    if x_user_id:
        return f"user:{x_user_id}"
    if guest_id:
        return f"guest:{guest_id}"
    raise HTTPException(status_code=400, detail="Provide X-User-ID or X-Guest-ID header")


@router.post("/view", status_code=status.HTTP_204_NO_CONTENT)
async def track_view(
    body: ViewEventCreate,
    x_user_id: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    user_ref = _get_user_ref(x_user_id, x_guest_id)
    await record_view(
        db,
        user_ref=user_ref,
        product_id=body.product_id,
        dwell_ms=body.dwell_ms,
        category_id=body.category_id,
        label_ids=body.label_ids,
        source=body.source,
    )


@router.post("/interaction", status_code=status.HTTP_204_NO_CONTENT)
async def track_interaction(
    body: InteractionEventCreate,
    x_user_id: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    user_ref = _get_user_ref(x_user_id, x_guest_id)
    await record_interaction(db, user_ref=user_ref, product_id=body.product_id, event_type=body.event_type)
