"""The shop's own settings.

`/settings/contact` is public — the storefront used to hardcode the shop's
email and phone in four places, in two different pairs; one row, edited from
the console, read here. `/admin/settings` is not: `alert_emails` is who hears
about a `danger`-level security event, and it must never reach a visitor,
which is why it lives on its own owner-only response rather than being added
to `ContactOut`.
"""
from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.http_cache import public_cache
from app.deps import DbSession, Owner
from app.modules.settings import service
from app.modules.settings.schemas import AdminSettingsOut, AlertEmailsWrite, ContactOut, ContactWrite

router = APIRouter(tags=["settings"])


@router.get("/settings/contact")
async def get_contact(db: DbSession, response: Response) -> ContactOut:
    public_cache(response, 300)
    row = await service.get(db)
    return ContactOut(email=row.contact_email, phone=row.contact_phone)


@router.patch("/admin/settings/contact")
async def update_contact(body: ContactWrite, db: DbSession, owner: Owner) -> ContactOut:
    row = await service.update(db, email=body.email, phone=body.phone)
    return ContactOut(email=row.contact_email, phone=row.contact_phone)


@router.get("/admin/settings")
async def get_admin_settings(db: DbSession, owner: Owner) -> AdminSettingsOut:
    row = await service.get(db)
    return AdminSettingsOut(
        email=row.contact_email, phone=row.contact_phone, alert_emails=row.alert_emails
    )


@router.patch("/admin/settings/alerts")
async def update_alert_emails(body: AlertEmailsWrite, db: DbSession, owner: Owner) -> AdminSettingsOut:
    row = await service.update_alert_emails(db, alert_emails=body.alert_emails)
    return AdminSettingsOut(
        email=row.contact_email, phone=row.contact_phone, alert_emails=row.alert_emails
    )
