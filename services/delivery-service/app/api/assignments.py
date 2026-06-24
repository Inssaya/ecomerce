from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Assignment, DeliveryProfile
from app.schemas import AssignmentCreate, AssignmentResponse, AssignmentStatusUpdate

router = APIRouter(prefix="/assignments", tags=["assignments"])

VALID_TRANSITIONS = {
    "assigned": ["picked_up", "cancelled"],
    "picked_up": ["in_transit"],
    "in_transit": ["delivered", "failed"],
    "delivered": [],
    "failed": ["assigned"],
    "cancelled": [],
}


@router.post("/", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    body: AssignmentCreate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    existing = await db.execute(select(Assignment).where(Assignment.order_id == body.order_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Order already assigned")

    agent_result = await db.execute(
        select(DeliveryProfile).where(DeliveryProfile.user_id == body.agent_id)
    )
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Delivery agent not found")

    assignment = Assignment(
        order_id=body.order_id,
        agent_id=body.agent_id,
        notes=body.notes,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.get("/mine", response_model=list[AssignmentResponse])
async def my_assignments(
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id or x_user_role not in ("delivery_individual", "delivery_company", "admin"):
        raise HTTPException(status_code=403, detail="Delivery agent access required")
    result = await db.execute(
        select(Assignment).where(Assignment.agent_id == x_user_id)
    )
    return result.scalars().all()


@router.put("/{assignment_id}/status", response_model=AssignmentResponse)
async def update_assignment_status(
    assignment_id: str,
    body: AssignmentStatusUpdate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id or x_user_role not in ("delivery_individual", "delivery_company", "admin"):
        raise HTTPException(status_code=403, detail="Delivery agent access required")

    result = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if x_user_role != "admin" and assignment.agent_id != x_user_id:
        raise HTTPException(status_code=403, detail="Not your assignment")

    allowed = VALID_TRANSITIONS.get(assignment.status, [])
    if body.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{assignment.status}' to '{body.status}'",
        )

    now = datetime.now(timezone.utc)
    assignment.status = body.status
    if body.notes:
        assignment.notes = body.notes
    if body.status == "picked_up":
        assignment.picked_up_at = now
    elif body.status == "delivered":
        assignment.delivered_at = now
        if body.cod_collected is not None:
            assignment.cod_collected = body.cod_collected

    await db.commit()
    await db.refresh(assignment)

    # Notify order-service of status change
    order_status_map = {
        "picked_up": "picked_up",
        "in_transit": "in_transit",
        "delivered": "delivered_paid",
        "failed": "delivery_failed",
    }
    if body.status in order_status_map:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.put(
                    f"{settings.order_service_url}/orders/{assignment.order_id}/status",
                    json={"status": order_status_map[body.status], "note": body.notes},
                    headers={"X-User-ID": x_user_id or "", "X-User-Role": x_user_role or ""},
                )
        except Exception:
            pass  # Fire-and-forget; order service can reconcile from events

    return assignment


@router.get("/stats")
async def assignment_stats(
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    pending_result = await db.execute(
        select(func.count()).where(Assignment.status == "assigned")
    )
    return {"pending": pending_result.scalar() or 0}


@router.get("/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: str,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    result = await db.execute(select(Assignment).where(Assignment.id == assignment_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if x_user_role != "admin" and assignment.agent_id != x_user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return assignment
