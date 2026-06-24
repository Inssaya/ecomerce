import aio_pika
import json
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.config import settings
from app.models import KycDocument, KycStatus, User, UserStatus

router = APIRouter(tags=["admin"])


def _require_admin(x_user_role: str | None):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/users")
async def list_users(
    page: int = 1,
    page_size: int = 20,
    role: str | None = None,
    status: str | None = None,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    q = select(User)
    if role:
        q = q.where(User.role == role)
    if status:
        q = q.where(User.status == status)
    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar() or 0
    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    users = result.scalars().all()
    return {
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role.value,
                "status": u.status.value,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/users/stats")
async def user_stats(
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    total_result = await db.execute(select(func.count()).select_from(User))
    pending_kyc_result = await db.execute(
        select(func.count()).where(KycDocument.review_status == KycStatus.submitted)
    )
    return {
        "total": total_result.scalar() or 0,
        "pending_kyc": pending_kyc_result.scalar() or 0,
    }


@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    body: dict,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    new_status = body.get("status")
    if new_status not in [s.value for s in UserStatus]:
        raise HTTPException(status_code=400, detail=f"Invalid status: {new_status}")
    user.status = UserStatus(new_status)
    await db.commit()
    return {"id": user_id, "status": new_status}


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role.value,
        "status": user.status.value,
        "created_at": user.created_at.isoformat(),
    }


@router.get("/kyc/pending")
async def list_pending_kyc(
    page: int = 1,
    page_size: int = 20,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    total_result = await db.execute(
        select(func.count()).where(KycDocument.review_status == KycStatus.submitted)
    )
    total = total_result.scalar() or 0
    result = await db.execute(
        select(KycDocument)
        .where(KycDocument.review_status == KycStatus.submitted)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    docs = result.scalars().all()
    return {
        "items": [
            {
                "id": d.id,
                "user_id": d.user_id,
                "doc_type": d.doc_type,
                "full_name": d.full_name,
                "review_status": d.review_status.value,
            }
            for d in docs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.put("/kyc/{kyc_id}/review")
async def review_kyc(
    kyc_id: str,
    body: dict,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    result = await db.execute(select(KycDocument).where(KycDocument.id == kyc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="KYC document not found")

    decision = body.get("decision")
    if decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Decision must be 'approved' or 'rejected'")

    doc.review_status = KycStatus.approved if decision == "approved" else KycStatus.rejected
    doc.reviewer_id = x_user_id
    if decision == "rejected":
        doc.rejection_reason = body.get("rejection_reason", "")

    # Update user status too
    user_result = await db.execute(select(User).where(User.id == doc.user_id))
    user = user_result.scalar_one_or_none()
    if user and decision == "approved":
        user.status = UserStatus.active

    await db.commit()

    # Publish event
    event_type = "kyc.approved" if decision == "approved" else "kyc.rejected"
    try:
        connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        channel = await connection.channel()
        exchange = await channel.declare_exchange("ecomerce", aio_pika.ExchangeType.TOPIC, durable=True)
        payload = {
            "user_id": doc.user_id,
            "email": user.email if user else "",
            "decision": decision,
            "rejection_reason": body.get("rejection_reason", ""),
        }
        await exchange.publish(
            aio_pika.Message(body=json.dumps(payload).encode()),
            routing_key=event_type,
        )
        await connection.close()
    except Exception:
        pass

    return {"id": kyc_id, "decision": decision}
