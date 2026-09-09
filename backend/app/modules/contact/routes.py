"""A message from someone who is not ordering yet.

This used to send nothing at all, on the reasoning that the WhatsApp and email
links beside the form gave the visitor their own channel. Those links are
gone — they asked somebody to compose the same message a second time, in a
different app, having already typed it — so this endpoint is now the only
channel, and it has to behave like one: the message is stored for the console,
the workshop is emailed so a message is not something you have to log in to
discover, and the sender is emailed a receipt so they know it arrived.

Neither email can fail the request. A message that was saved but not announced
is recoverable; a 500 that loses what somebody wrote is not.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select

from fastapi import APIRouter, status

from app.core.errors import get_or_404
from app.core.limits import ContactLimit
from app.deps import DbSession, Lang, Owner, Paging
from app.models.contact import ContactMessage
from app.modules.contact.schemas import ContactCreate, ContactMessageOut, ContactMessagePatch
from app.modules.notify.email import send_contact_ack, send_contact_alert
from app.modules.settings import service as settings_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["contact"])


@router.post("/contact", response_model=ContactMessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    body: ContactCreate, db: DbSession, _: ContactLimit, lang: Lang
) -> ContactMessage:
    message = ContactMessage(**body.model_dump())
    db.add(message)
    await db.commit()
    await db.refresh(message)

    shop = await settings_service.get(db)
    recipients = [a.strip() for a in shop.alert_emails.split(",") if a.strip()]
    if not recipients and shop.contact_email:
        recipients = [shop.contact_email]

    try:
        await send_contact_alert(
            to=recipients,
            name=message.name,
            email=message.email or "",
            phone=message.phone or "",
            message=message.message,
        )
    except Exception as exc:
        logger.error("contact %s: could not alert the workshop: %s", message.id, exc)

    if message.email:
        try:
            await send_contact_ack(
                to=message.email, name=message.name, lang=lang, message=message.message
            )
        except Exception as exc:
            logger.error("contact %s: could not acknowledge to sender: %s", message.id, exc)

    return message


@router.get("/admin/contact-messages", response_model=list[ContactMessageOut])
async def list_messages(
    db: DbSession,
    owner: Owner,
    paging: Paging,
    unread: bool = False,
    archived: bool = False,
) -> list[ContactMessage]:
    """The inbox. Archived messages are out of the way by default — they are
    kept, not deleted, so a lead that looked like nothing stays findable."""
    query = select(ContactMessage)
    query = query.where(
        ContactMessage.archived_at.is_not(None) if archived else ContactMessage.archived_at.is_(None)
    )
    if unread:
        query = query.where(ContactMessage.read_at.is_(None))
    rows = await db.scalars(
        query.order_by(ContactMessage.created_at.desc()).offset(paging.offset).limit(paging.size)
    )
    return list(rows)


@router.patch("/admin/contact-messages/{message_id}", response_model=ContactMessageOut)
async def archive_message(
    message_id: str, body: ContactMessagePatch, db: DbSession, owner: Owner
) -> ContactMessage:
    """File a message away, or bring it back."""
    message = await get_or_404(db, ContactMessage, message_id, detail="Message not found")
    message.archived_at = datetime.now(UTC) if body.archived else None
    await db.commit()
    await db.refresh(message)
    return message


@router.post("/admin/contact-messages/{message_id}/read", response_model=ContactMessageOut)
async def mark_read(message_id: str, db: DbSession, owner: Owner) -> ContactMessage:
    message = await get_or_404(db, ContactMessage, message_id, detail="Message not found")
    if message.read_at is None:
        message.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(message)
    return message
