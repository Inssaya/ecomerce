"""A message from someone who is not ordering yet.

No email is sent from here on purpose: the storefront's WhatsApp/email links
already give a visitor an instant channel if they want one, so this endpoint's
only job is to make sure the message also always lands somewhere the owner
will see it, whether or not that visitor actually followed through on WhatsApp
or their mail client.
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select

from fastapi import APIRouter, status

from app.core.errors import get_or_404
from app.core.limits import ContactLimit
from app.deps import DbSession, Owner, Paging
from app.models.contact import ContactMessage
from app.modules.contact.schemas import ContactCreate, ContactMessageOut

router = APIRouter(tags=["contact"])


@router.post("/contact", response_model=ContactMessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(body: ContactCreate, db: DbSession, _: ContactLimit) -> ContactMessage:
    message = ContactMessage(**body.model_dump())
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


@router.get("/admin/contact-messages", response_model=list[ContactMessageOut])
async def list_messages(db: DbSession, owner: Owner, paging: Paging) -> list[ContactMessage]:
    rows = await db.scalars(
        select(ContactMessage)
        .order_by(ContactMessage.created_at.desc())
        .offset(paging.offset)
        .limit(paging.size)
    )
    return list(rows)


@router.post("/admin/contact-messages/{message_id}/read", response_model=ContactMessageOut)
async def mark_read(message_id: str, db: DbSession, owner: Owner) -> ContactMessage:
    message = await get_or_404(db, ContactMessage, message_id, detail="Message not found")
    if message.read_at is None:
        message.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(message)
    return message
