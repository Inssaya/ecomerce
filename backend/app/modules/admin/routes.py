"""The control room.

REBUILD-PLAN §7 lists six areas. They are six endpoints, not six screens: for
one owner reading this on a phone between other jobs, the panel should open on
one question answered and keep everything else a tap away.

Every figure comes from `metrics`, which is also what the copilot reads.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.deps import DbSession, Lang, Owner
from app.modules.admin import analytics as analytics_service
from app.modules.admin import customers as customers_service
from app.modules.admin import forecast, metrics
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


@router.get("/today")
async def today(
    db: DbSession,
    owner: Owner,
    lang: Lang,
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: str | None = None,
    product_id: str | None = None,
) -> dict:
    """Everything the Board's first face needs, in one call.

    The console drew this screen from four separate requests, which on mobile
    data is four chances to look broken. It is one now.

    It also carries `lead`: the single thing worth saying first, chosen here
    rather than in the browser so the copilot and the screen can never
    disagree about what today's problem is. The order is deliberate — a
    refusal rate over target outranks a queue, and a queue outranks revenue,
    because that is the order in which they cost money.

    **Scope** (REBUILD-PLAN §3): pick a category or a piece and the money and
    the behaviour narrow to it. The work queue does not — "what needs me
    today" is a question about the whole shop, and narrowing it would hide
    work rather than focus it. `scope.shop_wide` names every block that
    ignored the scope so the screen can say so instead of quietly showing
    unscoped figures under a scoped heading.
    """
    period = _period(date_from, date_to, 30)
    scope = metrics.Scope(category_id=category_id, product_id=product_id)

    now, wallet, audience, funnel = (
        await metrics.pulse(db),
        await metrics.money_block(db, period, scope),
        await analytics_service.audience(db, period, scope),
        await analytics_service.funnel(db, period, scope),
    )

    refusals = wallet["refusals"]
    revenue = wallet["revenue"]

    # Enough deliveries to draw a conclusion from? One refusal out of two is
    # 50% and means nothing; saying so is worth more than a red number.
    judged = refusals["delivered_or_attempted"] >= 10

    if judged and refusals["refusal_rate_pct"] > refusals["target_pct"]:
        worst = refusals["worst_cities"][0] if refusals["worst_cities"] else None
        lead = {
            "kind": "refusals",
            "value": f"{refusals['refusal_rate_pct']}%",
            "sentence": (
                f"{refusals['refused']} of {refusals['delivered_or_attempted']} parcels came back"
                + (f" — worst in {worst['city']}." if worst else ".")
            ),
        }
    elif now["requests_waiting_on_a_quote"]:
        waiting = now["requests_waiting_on_a_quote"]
        lead = {
            "kind": "quotes",
            "value": str(waiting),
            "sentence": f"{'person is' if waiting == 1 else 'people are'} waiting on a price.",
        }
    elif now["open_orders"]:
        lead = {
            "kind": "orders",
            "value": str(now["open_orders"]),
            "sentence": "orders are still open.",
        }
    else:
        lead = {
            "kind": "revenue",
            "value": f"{round(revenue['collected_mad'])} MAD",
            "sentence": f"collected over the last {period.days} days.",
        }

    return {
        "period": period.as_dict(),
        "scope": {
            **scope.as_dict(),
            # Named so the screen can label them rather than silently showing
            # shop-wide figures under a scoped heading.
            "shop_wide": ["queue", "lead"] if scope.active else [],
        },
        "lead": lead,
        "queue": {
            "to_confirm": now["orders_today"],
            "open_orders": now["open_orders"],
            "quotes_to_send": now["requests_waiting_on_a_quote"],
            "unread_messages": await metrics.unread_messages(db),
        },
        "pulse": now,
        "revenue": revenue,
        "refusals": refusals,
        "conversion": wallet["conversion"],
        "audience": audience,
        "funnel": funnel,
        "explain": {
            key: KPI_EXPLANATIONS[key][1 if lang == "ar" else 0] for key in KPI_EXPLANATIONS
        },
    }


@router.get("/waiting")
async def waiting(db: DbSession, owner: Owner, limit: int = Query(default=50, ge=1, le=200)) -> list[dict]:
    """Who is waiting on which piece, across the whole shelf.

    Only a per-product count existed, which meant the sharpest demand signal
    the shop has — somebody who would have paid, for a real piece, at a price
    they already saw — could not be read anywhere. A search tells you what
    someone typed; this tells you what they would have bought.
    """
    return await metrics.waiting_list(db, limit)


@router.get("/decide")
async def decide(
    db: DbSession,
    owner: Owner,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """*What should I make next* — the only question a workshop really has.

    Assembled in one response rather than two, because the answer is the two
    read together: what people asked us for and searched for without finding,
    against what is actually selling.
    """
    period = _period(date_from, date_to, 30)
    return {
        "period": period.as_dict(),
        "demand": await metrics.what_to_make_next(db, period),
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


@router.get("/analytics")
async def analytics(
    db: DbSession,
    owner: Owner,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int | None = Query(default=None, ge=1, le=500),
) -> dict:
    """What people actually did here — visitors, the funnel, and the tables.

    One response rather than five. The panel is read on a phone on mobile data,
    and five round trips to draw one screen is what makes a dashboard feel
    broken.

    `limit` reaches the per-piece table and the unmet lists, which otherwise
    truncate at 60 and 20 with no indication that a tail was dropped.
    """
    return await analytics_service.overview(db, _period(date_from, date_to, 30), limit)


@router.get("/products/{product_id}/analytics")
async def product_analytics(
    product_id: str,
    db: DbSession,
    owner: Owner,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """One piece, on its own.

    Lives here beside the other analytics rather than in the catalogue router,
    because it reads `signals` and shares the period helper with everything
    else on this page — the URL is what the console cares about, not which
    module the function sits in.
    """
    return await analytics_service.for_product(db, product_id, _period(date_from, date_to, 30))


@router.get("/forecast")
async def forecast_next_week(db: DbSession, owner: Owner) -> dict:
    """How many of each piece we expect to sell in the next seven days.

    A decayed sales rate with a Poisson interval — see `forecast.py` for why
    that and not something cleverer. Every row carries the reasoning that
    produced it and how confident it is, because a number the owner cannot
    interrogate is a number they will either over-trust or ignore.
    """
    return await forecast.next_seven_days(db)


@router.get("/customers")
async def customers(db: DbSession, owner: Owner, q: str | None = Query(default=None)) -> list[dict]:
    """Everyone who has bought something, registered or not — see
    `customers.py` for why a guest counts as a customer here."""
    return await customers_service.list_customers(db, q)


@router.get("/customers/{customer_id}/analytics")
async def customer_analytics(customer_id: str, db: DbSession, owner: Owner) -> dict:
    """One person's behaviour — visits, the funnel, dwell, what they have
    hearted or saved. Works for a guest: see `customers.py` for the
    fingerprint join that makes that true."""
    return await customers_service.customer_analytics(db, customer_id)


class CustomerActive(BaseModel):
    active: bool


@router.patch("/customers/{user_id}/active")
async def set_customer_active(user_id: str, body: CustomerActive, db: DbSession, owner: Owner) -> dict:
    user = await customers_service.set_customer_active(db, user_id, body.active)
    return {"id": user.id, "is_active": user.is_active}


class CustomerBlock(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    #: Whether to also flip the account off, when there is one. Blocking a
    #: device and deactivating an account are different moves — a guest has
    #: only the first available — offered together because "block this
    #: customer" is the sentence the owner is actually reading.
    deactivate_account: bool = True


@router.post("/customers/{customer_id}/block")
async def block_customer(customer_id: str, body: CustomerBlock, db: DbSession, owner: Owner) -> dict:
    return await customers_service.block_customer(
        db, customer_id, reason=body.reason, deactivate_account=body.deactivate_account
    )


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
