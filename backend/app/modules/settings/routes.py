"""The shop's contact details — read by anyone, changed by the owner alone.

The storefront used to hardcode these in four places, in two different
pairs. One row, edited from the console, read here.
"""
from __future__ import annotations

from fastapi import APIRouter

from app.deps import DbSession, Owner
from app.modules.settings import service
from app.modules.settings.schemas import ContactOut, ContactWrite

router = APIRouter(tags=["settings"])


@router.get("/settings/contact")
async def get_contact(db: DbSession) -> ContactOut:
    row = await service.get(db)
    return ContactOut(email=row.contact_email, phone=row.contact_phone)


@router.patch("/admin/settings/contact")
async def update_contact(body: ContactWrite, db: DbSession, owner: Owner) -> ContactOut:
    row = await service.update(db, email=body.email, phone=body.phone)
    return ContactOut(email=row.contact_email, phone=row.contact_phone)
