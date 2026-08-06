"""Operational commands.

    python -m app.cli seed-owner  owner@example.ma  'a real password'  'Full Name'

The owner account cannot be created through the API — `/auth/register` always
produces a customer. There is one workshop, and its account is provisioned
deliberately, from the machine that runs the deployment.
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

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
    print(f"Unknown command: {command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
