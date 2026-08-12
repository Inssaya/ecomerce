"""Error shapes used across modules.

The three-line `select … scalar_one_or_none … raise HTTPException(404)` triple
appeared in essentially every endpoint of every old service, each with slightly
different wording. It is written once here.
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Any, TypeVar

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import strategy_options

from app.db import Base

ModelT = TypeVar("ModelT", bound=Base)


async def get_or_404(
    db: AsyncSession,
    model: type[ModelT],
    ident: Any,
    *,
    field: str = "id",
    detail: str = "Not found",
    options: Sequence[strategy_options._AbstractLoad] = (),
) -> ModelT:
    query = select(model).where(getattr(model, field) == ident)
    if options:
        query = query.options(*options)
    instance = await db.scalar(query)
    if instance is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return instance


def conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def not_found(detail: str) -> HTTPException:
    """For the case `get_or_404` cannot cover: an identifier that is the wrong
    shape to look up at all. Handing a phone number to a UUID column raises a
    database error, which surfaces as a 500 for what is really a 404."""
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
