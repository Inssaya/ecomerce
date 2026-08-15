from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SETTINGS_ID, ShopSettings


async def get(db: AsyncSession) -> ShopSettings:
    """The one row. The migration that created this table also seeded it, so
    a missing row would mean the migration never ran — let that surface as a
    clear error rather than inventing a value here."""
    row = await db.get(ShopSettings, SETTINGS_ID)
    assert row is not None, "shop_settings has no row — migration b91f6a3c58e2 did not seed it"
    return row


async def update(db: AsyncSession, *, email: str, phone: str) -> ShopSettings:
    row = await get(db)
    row.contact_email = email
    row.contact_phone = phone
    await db.commit()
    await db.refresh(row)
    return row
