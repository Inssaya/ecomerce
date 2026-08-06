"""Waiting on a piece.

A sold-out page is a dead end, and a dead end is a visitor we paid to attract
and then sent away. This turns it into the second-best outcome we have after a
sale: their number, and a specific thing they wanted.

The owner side matters as much as the customer side. When pieces are added to
a product somebody was waiting on, everyone waiting is told at once — and the
count of people waiting is the sharpest answer the workshop gets to *what
should I make next*, because unlike a search it is attached to a real piece at
a price they already saw.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Product
from app.models.alerts import PieceAlert
from app.modules.notify.email import send_order_update

logger = logging.getLogger(__name__)


async def waiting_for(db: AsyncSession, product_id: str) -> int:
    """How many people are waiting on this piece and have not been told yet."""
    return (
        await db.scalar(
            select(func.count())
            .select_from(PieceAlert)
            .where(PieceAlert.product_id == product_id, PieceAlert.notified_at.is_(None))
        )
        or 0
    )


async def add(
    db: AsyncSession, *, product: Product, phone: str, email: str | None, lang: str
) -> PieceAlert:
    """Register interest. Asking twice is asking once."""
    existing = await db.scalar(
        select(PieceAlert).where(
            PieceAlert.product_id == product.id, PieceAlert.phone == phone
        )
    )
    if existing is not None:
        # They asked again, so they still want it: clear any past notification
        # rather than leaving them out of the next batch.
        existing.notified_at = None
        existing.email = email or existing.email
        existing.lang = lang
        await db.commit()
        return existing

    alert = PieceAlert(product_id=product.id, phone=phone, email=email, lang=lang)
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert


async def announce(db: AsyncSession, product: Product) -> int:
    """Tell everyone waiting that we made more. Returns how many were told.

    Called when pieces are added, so nobody has to remember to do it. Never
    raises: a failed message must not fail the act of putting pieces on the
    shelf.
    """
    waiting = list(
        await db.scalars(
            select(PieceAlert).where(
                PieceAlert.product_id == product.id, PieceAlert.notified_at.is_(None)
            )
        )
    )
    if not waiting:
        return 0

    now = datetime.now(UTC)
    for alert in waiting:
        alert.notified_at = now
        if not alert.email:
            # No address: the owner still sees them in the panel and can send a
            # WhatsApp, which is how most of this market actually talks.
            continue
        url = f"{settings.app_url}/{alert.lang}/piece/{product.slug}"
        try:
            await send_order_update(
                to=alert.email,
                lang=alert.lang,
                reference=product.title(alert.lang),
                heading_en="We made more",
                heading_ar="صنعنا المزيد",
                lines_en=[
                    f"You asked about {product.title('en')}. We have made more, and it is "
                    "on the shelf again.",
                    "As before, you pay in cash when it reaches you.",
                ],
                lines_ar=[
                    f"سألت عن {product.title('ar')}. صنعنا المزيد، وهي على الرف من جديد.",
                    "كما في السابق، تخلّص نقداً عند وصولها إليك.",
                ],
                track_url=url,
            )
        except Exception as exc:
            logger.error("Could not tell %s about %s: %s", alert.email, product.slug, exc)

    await db.commit()
    logger.info("Told %s people that %s is back", len(waiting), product.slug)
    return len(waiting)
