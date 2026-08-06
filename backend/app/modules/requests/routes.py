"""Tell us what you need, and follow what happens to it."""
from __future__ import annotations

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.errors import get_or_404
from app.core.limits import RequestLimit
from app.deps import CurrentUser, DbSession, Lang, OptionalUser, Owner, Paging
from app.models import Order
from app.models.requests import CustomRequest, RequestStatus
from app.modules.notify.service import whatsapp_url
from app.modules.orders.schemas import Address
from app.modules.requests import service
from app.modules.requests.schemas import (
    Quote,
    RequestCreate,
    RequestOut,
    RequestStatusChange,
)

router = APIRouter(tags=["requests"])


class Approval(BaseModel):
    """Saying yes to a quote. The address is asked for here rather than at the
    start: nobody should type their address to find out a price."""

    address: Address
    note: str | None = Field(default=None, max_length=500)


async def _out(db: DbSession, request: CustomRequest, lang: str) -> RequestOut:
    response = RequestOut.model_validate(request, from_attributes=True)
    response.quote_note = (
        request.quote_note_ar or request.quote_note_en
    ) if lang == "ar" else request.quote_note_en
    response.whatsapp_url = whatsapp_url(request)
    if request.order_id:
        response.order_reference = await db.scalar(
            select(Order.reference).where(Order.id == request.order_id)
        )
    return response


@router.post("/requests", response_model=RequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    body: RequestCreate, db: DbSession, user: OptionalUser, lang: Lang, _: RequestLimit
) -> RequestOut:
    """"If we cannot find it, we make it."

    No account, no price, no commitment — a description and a number we can
    call. Turning a dead end into a lead is the entire point.
    """
    request = await service.raise_request(db, body, user)
    return await _out(db, request, lang)


@router.get("/requests/track/{tracking_token}", response_model=RequestOut)
async def track_request(tracking_token: str, db: DbSession, lang: Lang) -> RequestOut:
    request = await get_or_404(
        db,
        CustomRequest,
        tracking_token,
        field="tracking_token",
        detail="We can't find that request",
    )
    return await _out(db, request, lang)


@router.post("/requests/track/{tracking_token}/approve", response_model=RequestOut)
async def approve_quote(
    tracking_token: str, body: Approval, db: DbSession, lang: Lang
) -> RequestOut:
    """The customer says yes to the price. Only now is anything owed."""
    request = await get_or_404(
        db,
        CustomRequest,
        tracking_token,
        field="tracking_token",
        detail="We can't find that request",
    )
    request = await service.approve(
        db, request, address=body.address.model_dump(), city=body.address.city
    )
    return await _out(db, request, lang)


@router.post("/requests/track/{tracking_token}/withdraw", response_model=RequestOut)
async def withdraw(tracking_token: str, db: DbSession, lang: Lang) -> RequestOut:
    """Changed their mind, or the price does not work. Closed cleanly, with
    nothing owed — a refused quote is not a refused package."""
    request = await get_or_404(
        db,
        CustomRequest,
        tracking_token,
        field="tracking_token",
        detail="We can't find that request",
    )
    request = await service.change_status(
        db, request, RequestStatus.withdrawn, None, actor="customer"
    )
    return await _out(db, request, lang)


@router.get("/requests/mine", response_model=list[RequestOut])
async def my_requests(
    user: CurrentUser, db: DbSession, lang: Lang, paging: Paging
) -> list[RequestOut]:
    rows = await db.scalars(
        select(CustomRequest)
        .where(CustomRequest.customer_id == user.id)
        .order_by(CustomRequest.created_at.desc())
        .offset(paging.offset)
        .limit(paging.size)
    )
    return [await _out(db, request, lang) for request in rows.unique()]


# ── Owner ─────────────────────────────────────────────────────────────────────


@router.get("/admin/requests", response_model=list[RequestOut])
async def list_requests(
    db: DbSession,
    owner: Owner,
    paging: Paging,
    lang: Lang,
    status_filter: RequestStatus | None = Query(default=None, alias="status"),
) -> list[RequestOut]:
    query = select(CustomRequest)
    if status_filter is not None:
        query = query.where(CustomRequest.status == status_filter)
    rows = await db.scalars(
        query.order_by(CustomRequest.created_at.desc()).offset(paging.offset).limit(paging.size)
    )
    return [await _out(db, request, lang) for request in rows.unique()]


@router.get("/admin/requests/{reference}", response_model=RequestOut)
async def read_request(reference: str, db: DbSession, owner: Owner, lang: Lang) -> RequestOut:
    request = await get_or_404(
        db, CustomRequest, reference.upper(), field="reference", detail="Request not found"
    )
    return await _out(db, request, lang)


@router.post("/admin/requests/{reference}/quote", response_model=RequestOut)
async def send_quote(
    reference: str, body: Quote, db: DbSession, owner: Owner, lang: Lang
) -> RequestOut:
    """A price and a real number of days. Both required — a quote without a
    date is the vagueness that gets packages refused."""
    request = await get_or_404(
        db, CustomRequest, reference.upper(), field="reference", detail="Request not found"
    )
    request = await service.quote(db, request, body)
    return await _out(db, request, lang)


@router.post("/admin/requests/{reference}/status", response_model=RequestOut)
async def move_request(
    reference: str, body: RequestStatusChange, db: DbSession, owner: Owner, lang: Lang
) -> RequestOut:
    request = await get_or_404(
        db, CustomRequest, reference.upper(), field="reference", detail="Request not found"
    )
    request = await service.change_status(db, request, body.status, body.note, actor="workshop")
    return await _out(db, request, lang)
