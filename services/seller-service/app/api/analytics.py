from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CommissionLedger, SellerProfile

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _require_seller(x_user_id: str | None, x_user_role: str | None) -> str:
    if not x_user_id or x_user_role not in ("seller", "admin"):
        raise HTTPException(status_code=403, detail="Seller access required")
    return x_user_id


@router.get("/summary")
async def analytics_summary(
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    seller_id = _require_seller(x_user_id, x_user_role)

    profile_res = await db.execute(select(SellerProfile).where(SellerProfile.user_id == seller_id))
    profile = profile_res.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    ledger_res = await db.execute(
        select(
            func.count(CommissionLedger.id).label("total_orders"),
            func.sum(CommissionLedger.gross_amount).label("total_gross"),
            func.sum(CommissionLedger.commission_amount).label("total_commission"),
            func.sum(CommissionLedger.net_amount).label("total_net"),
        ).where(CommissionLedger.seller_id == seller_id)
    )
    row = ledger_res.one()
    return {
        "total_orders": row.total_orders or 0,
        "total_gross_mad": row.total_gross or 0.0,
        "total_commission_mad": row.total_commission or 0.0,
        "total_net_mad": row.total_net or 0.0,
        "payout_balance_mad": profile.payout_balance,
        "commission_rate": profile.commission_rate,
    }


@router.get("/stats")
async def platform_seller_stats(
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    from app.models import SellerStatus
    active_res = await db.execute(
        select(func.count()).where(SellerProfile.status == SellerStatus.verified)
    )
    return {"active_sellers": active_res.scalar() or 0}


@router.get("/ledger")
async def ledger(
    page: int = 1,
    size: int = 20,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    seller_id = _require_seller(x_user_id, x_user_role)
    query = (
        select(CommissionLedger)
        .where(CommissionLedger.seller_id == seller_id)
        .order_by(CommissionLedger.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    result = await db.execute(query)
    return result.scalars().all()
