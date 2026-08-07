"""Operational commands.

    python -m app.cli seed-owner  owner@example.ma  'a real password'  'Full Name'
    python -m app.cli test-email  you@example.ma

The owner account cannot be created through the API — `/auth/register` always
produces a customer. There is one workshop, and its account is provisioned
deliberately, from the machine that runs the deployment.
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.config import settings
from app.core.security import hash_password
from app.db import SessionLocal
from app.models import User, UserRole

MIN_PASSWORD_LENGTH = 12


async def seed_owner(email: str, password: str, full_name: str) -> int:
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"The owner password must be at least {MIN_PASSWORD_LENGTH} characters.")
        return 2

    async with SessionLocal() as db:
        existing_owner = await db.scalar(select(User).where(User.role == UserRole.owner))
        if existing_owner is not None and existing_owner.email != email:
            print(f"An owner already exists ({existing_owner.email}). There is only one workshop.")
            return 1

        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, password_hash=hash_password(password), full_name=full_name)
            db.add(user)
        else:
            user.password_hash = hash_password(password)
            user.full_name = full_name
        user.role = UserRole.owner
        user.is_active = True
        await db.commit()

    print(f"Owner account ready: {email}")
    return 0


async def test_email(to: str) -> int:
    """Prove the mail configuration before a customer depends on it.

    Sending is deliberately non-fatal everywhere else — a failed email must
    never fail the order it was reporting on — which means a broken SMTP
    configuration produces no visible error anywhere. The shop simply stops
    telling anyone their package is coming, and finds out weeks later from the
    refusals. This is the one place that reports the failure out loud.
    """
    from app.modules.notify.email import _layout, send_email

    print(f"host     {settings.smtp_host}:{settings.smtp_port}")
    print(f"from     {settings.smtp_from}")
    print(f"user     {settings.smtp_user or '(none)'}")
    print(f"tls      {'yes' if settings.smtp_tls else 'no'}"
          f"{' (implicit, port 465)' if settings.smtp_tls and settings.smtp_port == 465 else ''}"
          f"{' (STARTTLS)' if settings.smtp_tls and settings.smtp_port != 465 else ''}")
    print(f"sending to {to}…")

    sent = await send_email(
        to,
        f"Test from {settings.app_name}",
        _layout(
            lang="en",
            heading="Your email is working",
            blocks=[
                "If you are reading this, the shop can tell customers when their "
                "order is on its way.",
                "Now check whether it landed in the inbox or in spam. If it is in "
                "spam, the SPF and DKIM records for your domain are missing — and "
                "an order update nobody sees is a package refused at the door.",
            ],
            action=("The shop", settings.app_url),
        ),
    )
    if sent:
        print("Sent. Check the inbox — and check the spam folder too.")
        return 0
    print("Failed. The error is in the log line above this one.")
    return 1


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    command, *args = sys.argv[1:]
    if command == "seed-owner":
        if len(args) != 3:
            print("Usage: python -m app.cli seed-owner <email> <password> <full name>")
            return 2
        return asyncio.run(seed_owner(*args))
    if command == "test-email":
        if len(args) != 1:
            print("Usage: python -m app.cli test-email <address>")
            return 2
        return asyncio.run(test_email(args[0]))
    print(f"Unknown command: {command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
