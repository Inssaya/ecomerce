"""Slugs that survive Arabic.

`python-slugify` transliterates by default, which turns an Arabic title into
either an empty string or a Latin approximation nobody typed. Arabic script is
kept as-is instead — modern browsers and Postgres handle it, and a URL a
customer can read in their own language is worth more than an ASCII one.
"""
from __future__ import annotations

import re
import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

_SEPARATORS = re.compile(r"[\s_/\\]+")
_DISALLOWED = re.compile(r"[^\w؀-ۿ-]", re.UNICODE)
_COLLAPSE = re.compile(r"-{2,}")


def slugify(value: str) -> str:
    text = _SEPARATORS.sub("-", (value or "").strip().lower())
    text = _DISALLOWED.sub("", text)
    return _COLLAPSE.sub("-", text).strip("-")


async def unique_slug(db: AsyncSession, model, value: str, *, fallback: str = "item") -> str:
    """A slug not already taken in `model.slug`."""
    base = slugify(value) or fallback
    taken = await db.scalar(select(func.count()).select_from(model).where(model.slug == base))
    if not taken:
        return base
    return f"{base}-{secrets.token_hex(3)}"
