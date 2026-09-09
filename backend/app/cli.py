"""Operational commands.

    python -m app.cli make-owner  owner@example.ma  [supabase-user-id]
    python -m app.cli test-email  you@example.ma

`make-owner` grants the console. It does not create an account and cannot:
accounts live in Supabase now, and the password is set there. What this does
is mark the shop's own row for that person as the workshop's — which is
deliberately not something the API can do, because an endpoint that grants
the console is an endpoint somebody can find.

Normally the row already exists, because it is created on that account's
first authenticated request. Pass the Supabase user id as well to grant the
role *before* the first sign-in.
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import User, UserRole


async def make_owner(email: str, supabase_user_id: str | None = None) -> int:
    email = email.strip().lower()
    async with SessionLocal() as db:
        existing_owner = await db.scalar(select(User).where(User.role == UserRole.owner))
        if existing_owner is not None and existing_owner.email != email:
            print(f"An owner already exists ({existing_owner.email}). There is only one workshop.")
            return 1

        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            if not supabase_user_id:
                print(
                    f"No account here for {email} yet. "
                    "Either sign in once at the shop with that address — the row "
                    "is created on the first authenticated request — or pass the "
                    "Supabase user id to grant the role up front: "
                    "python -m app.cli make-owner <email> <supabase-user-id>"
                )
                return 1
            user = User(id=supabase_user_id, email=email)
            db.add(user)

        user.role = UserRole.owner
        user.is_active = True
        await db.commit()

    print(f"{email} is the workshop. Sign in at the shop and you will land on the console.")
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
    if command == "make-owner":
        if len(args) not in (1, 2):
            print("Usage: python -m app.cli make-owner <email> [supabase-user-id]")
            return 2
        return asyncio.run(make_owner(*args))
    if command == "test-email":
        if len(args) != 1:
            print("Usage: python -m app.cli test-email <address>")
            return 2
        return asyncio.run(test_email(args[0]))
    print(f"Unknown command: {command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
