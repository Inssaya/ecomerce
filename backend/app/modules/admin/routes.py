"""The control room.

REBUILD-PLAN §7 lists six areas. They are six endpoints, not six screens: for
one owner reading this on a phone between other jobs, the panel should open on
one question answered and keep everything else a tap away.

Every figure comes from `metrics`, which is also what the copilot reads.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.deps import DbSession, Lang, Owner
from app.modules.admin import metrics
from app.modules.admin.metrics import KPI_EXPLANATIONS, Period

router = APIRouter(prefix="/admin", tags=["admin"])


def _period(date_from: date | None, date_to: date | None, default_days: int) -> Period:
    if date_from and date_to:
        return Period(start=date_from, end=date_to)
    return Period.last(default_days)


@router.get("/pulse")
async def pulse(db: DbSession, owner: Owner) -> dict:
    """The screen the owner opens on."""
    return await metrics.pulse(db)


@router.get("/decide")
async def decide(
    db: DbSession,
    owner: Owner,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """*What should I make next* — the only question a workshop really has.

    Assembled in one response rather than four, because the answer is the four
    read together: what people asked us for, what they searched and did not
    find, what is running out, and what has been sitting there for six weeks.
    """
    period = _period(date_from, date_to, 30)
    return {
        "period": period.as_dict(),
        "demand": await metrics.what_to_make_next(db, period),
        "shelf": await metrics.shelf_state(db),
        "best_sellers": await metrics.best_sellers(db, period),
    }


@router.get("/money")
async def money(
    db: DbSession,
    owner: Owner,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Cash collected, how many packages came back, and how many visitors
    turned into orders."""
    period = _period(date_from, date_to, 30)
    return {
        "revenue": await metrics.revenue(db, period),
        "refusals": await metrics.refusals(db, period),
        "conversion": await metrics.conversion(db, period),
    }


class Explanation(BaseModel):
    name: str
    explanation: str


@router.get("/explain", response_model=list[Explanation])
async def explain(
    db: DbSession,
    owner: Owner,
    lang: Lang,
    name: str | None = Query(default=None),
) -> list[Explanation]:
    """What a number means and what moves it.

    Shown next to the figure itself, not hidden behind a help page — a metric
    nobody understands changes no decision.
    """
    wanted = [name] if name and name in KPI_EXPLANATIONS else sorted(KPI_EXPLANATIONS)
    return [
        Explanation(name=key, explanation=KPI_EXPLANATIONS[key][1 if lang == "ar" else 0])
        for key in wanted
    ]
