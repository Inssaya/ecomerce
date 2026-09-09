"""Tell us what you need, and follow what happens to it."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.errors import bad_request, get_or_404
from app.core.limits import ReferenceUploadLimit, RequestLimit
from app.core.storage import UploadRejected, public_url, verify_uploaded
from app.deps import DbSession, Lang, OptionalUser, Owner, Paging
from app.models import Category, Order
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

#: A photo of a sketch off a phone, not a print master. Smaller than the 12 MB
#: catalogue limit because nothing here is ever printed — it is looked at once,
#: by the person who will make the thing.
MAX_REFERENCE_BYTES = 8 * 1024 * 1024


class Approval(BaseModel):
    """Saying yes to a quote. The address is asked for here rather than at the
    start: nobody should type their address to find out a price."""

    address: Address
    note: str | None = Field(default=None, max_length=500)


async def _out(
    db: DbSession,
    request: CustomRequest,
    lang: str,
    *,
    category_names: dict[str, str] | None = None,
) -> RequestOut:
    response = RequestOut.model_validate(request, from_attributes=True)
    response.quote_note = (
        request.quote_note_ar or request.quote_note_en
    ) if lang == "ar" else request.quote_note_en
    response.whatsapp_url = whatsapp_url(request)
    response.hidden = request.hidden_at is not None
    if request.category_id:
        response.category_name = (
            category_names.get(request.category_id)
            if category_names is not None
            else await db.scalar(select(Category.name_en).where(Category.id == request.category_id))
        )
    if request.order_id:
        response.order_reference = await db.scalar(
            select(Order.reference).where(Order.id == request.order_id)
        )
    return response


async def _out_many(db: DbSession, requests: list[CustomRequest], lang: str) -> list[RequestOut]:
    """A page of requests, with every category name resolved in one query
    rather than one per row."""
    category_ids = {request.category_id for request in requests if request.category_id}
    names: dict[str, str] = {}
    if category_ids:
        rows = await db.execute(
            select(Category.id, Category.name_en).where(Category.id.in_(category_ids))
        )
        names = dict(rows.all())
    return [await _out(db, request, lang, category_names=names) for request in requests]


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


class ReferenceClaim(BaseModel):
    """The name of something already written to storage by the browser."""

    key: str = Field(min_length=1, max_length=300)


@router.post("/requests/references", status_code=status.HTTP_201_CREATED)
async def claim_reference(body: ReferenceClaim, _: ReferenceUploadLimit) -> dict[str, str]:
    """Accept a photo of the thing they want, after the browser has uploaded it.

    `CustomRequest.references` has always existed and the form has always shown
    an "attach a sketch" box, but there was no endpoint behind it: the files
    were read into browser memory and their *filenames* were pasted into the
    description. The workshop received "Files: IMG_4471.jpg" and no image, and
    the customer believed they had sent one — which is the worst version of
    this, because a picture is usually the whole brief.

    The bytes now go straight to storage from the browser, so this takes a name
    rather than a file. That does not weaken the check that mattered: the
    declared content type was always a string the client chose, and what
    decides whether this is really an image is still this application reading
    the first bytes — now out of the bucket, and deleting whatever is not.

    Unauthenticated, because asking for a price must not require an account,
    which makes it the one place a stranger can cause a write. Hence the rate
    limit, and hence the size ceiling being enforced here rather than trusted
    from the browser: a signature carries no size of its own.
    """
    if not body.key.startswith("requests/"):
        raise bad_request("That upload is not a reference photo")
    try:
        await verify_uploaded(body.key, max_bytes=MAX_REFERENCE_BYTES)
    except UploadRejected as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return {"url": public_url(body.key)}


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


# ── Owner ─────────────────────────────────────────────────────────────────────


@router.get("/admin/requests", response_model=list[RequestOut])
async def list_requests(
    db: DbSession,
    owner: Owner,
    paging: Paging,
    lang: Lang,
    status_filter: RequestStatus | None = Query(default=None, alias="status"),
    category_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    hidden: bool = Query(default=False, description="Show the archived view instead of the live one"),
) -> list[RequestOut]:
    query = select(CustomRequest)
    if hidden:
        query = query.where(CustomRequest.hidden_at.is_not(None))
    else:
        query = query.where(CustomRequest.hidden_at.is_(None))
    if status_filter is not None:
        query = query.where(CustomRequest.status == status_filter)
    if category_id:
        query = query.where(CustomRequest.category_id == category_id)
    if date_from:
        query = query.where(CustomRequest.created_at >= date_from)
    if date_to:
        query = query.where(CustomRequest.created_at < date_to + timedelta(days=1))
    rows = await db.scalars(
        query.order_by(CustomRequest.created_at.desc()).offset(paging.offset).limit(paging.size)
    )
    return await _out_many(db, list(rows.unique()), lang)


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


@router.post("/admin/requests/{reference}/approve", response_model=RequestOut)
async def approve_quote(
    reference: str, body: Approval, db: DbSession, owner: Owner, lang: Lang
) -> RequestOut:
    """The owner records that the customer said yes, and the order exists.

    This used to be `POST /requests/track/{token}/approve` — unauthenticated,
    reachable by anyone holding the tracking link. A custom piece is agreed on
    the phone: the details get confirmed, the price gets confirmed, and only
    then is anything owed. A button that turns a quote into a committed order
    without that call skips the one step that stops a misunderstanding
    becoming a made object nobody wants.

    So the address is taken here, from the person who just had the call, and
    approval moved to where the decision actually happens. It cannot live in
    the generic status endpoint below: `change_status` only moves the enum,
    and an approval that moved the state without writing the `Order` would
    lose the order silently.
    """
    request = await get_or_404(
        db, CustomRequest, reference.upper(), field="reference", detail="Request not found"
    )
    request = await service.approve(
        db, request, address=body.address.model_dump(), city=body.address.city
    )
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


@router.post("/admin/requests/{reference}/hide", response_model=RequestOut)
async def hide_request(reference: str, db: DbSession, owner: Owner, lang: Lang) -> RequestOut:
    """"Delete", in a shop where every lead is worth keeping: it leaves the
    working queue and stays reachable from the Hidden view."""
    request = await get_or_404(
        db, CustomRequest, reference.upper(), field="reference", detail="Request not found"
    )
    request = await service.hide_request(db, request)
    return await _out(db, request, lang)


@router.post("/admin/requests/{reference}/unhide", response_model=RequestOut)
async def unhide_request(reference: str, db: DbSession, owner: Owner, lang: Lang) -> RequestOut:
    request = await get_or_404(
        db, CustomRequest, reference.upper(), field="reference", detail="Request not found"
    )
    request = await service.unhide_request(db, request)
    return await _out(db, request, lang)
