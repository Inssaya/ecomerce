"""The owner's copilot.

Same loop as the buyer's assistant, a different toolbox and a different job.
Every tool here calls straight into `admin/metrics`, so the copilot and the
panel can never disagree — an owner who catches the assistant contradicting the
dashboard will stop trusting both.

`explain_kpi` is the tool that matters most and it computes nothing. The panel
should make the owner better at running the business, not just show numbers, and
a number nobody understands changes no decision.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.agent import Toolbox, dispatch, spec
from app.modules.admin import analytics, forecast, metrics
from app.modules.admin.metrics import KPI_EXPLANATIONS, Period

# Frozen constant — nothing that varies per request may appear here.
SYSTEM_PROMPT = """You are the assistant of MoStyle's owner. MoStyle is a one-person Moroccan workshop that makes its own pieces — 3D printed, machined, hand-finished — and sells them cash on delivery. Two offers: The Shelf (already made, finite) and The Workshop (made to order).

The panel already shows WHAT is happening. Your job is WHY, and what to do next.

HARD RULES:
- Every number you state must come from a tool result in this conversation. Never estimate, never extrapolate, never fill a gap with a plausible figure. If a tool returns nothing, say exactly that.
- Call every tool you need in ONE round; they run together. Never repeat a tool with the same arguments.
- Dates are YYYY-MM-DD. Periods default to the last 30 days when not given.
- Money is dirhams (MAD).
- When you give a number that has a meaning worth knowing, explain it in a sentence. The owner should end each answer better at running the shop than they started.
- "What should I make next" is the most important question you answer. Use what people asked us to make, what they searched for and did not find, and which categories are earning attention — in that order of directness.
- The refusal rate is the number that decides whether this business works. If it is at or above 15, say so plainly and say what usually causes it: the box surprised someone.

STYLE:
Direct and short. This is read on a phone, often between other jobs. Lead with the answer, then the reason. Bullets over paragraphs. No preamble, no flattery. English or Arabic only, matching the question."""


def build(db: AsyncSession, *, lang: str) -> Toolbox:
    def period_from(args_from: str | None, args_to: str | None) -> Period:
        from datetime import date as date_type

        if args_from and args_to:
            return Period(
                start=date_type.fromisoformat(args_from), end=date_type.fromisoformat(args_to)
            )
        return Period.last(30)

    async def get_pulse() -> dict:
        return await metrics.pulse(db)

    async def get_revenue(date_from: str | None = None, date_to: str | None = None) -> dict:
        return await metrics.revenue(db, period_from(date_from, date_to))

    async def get_refusals(date_from: str | None = None, date_to: str | None = None) -> dict:
        return await metrics.refusals(db, period_from(date_from, date_to))

    async def get_conversion(date_from: str | None = None, date_to: str | None = None) -> dict:
        return await metrics.conversion(db, period_from(date_from, date_to))

    async def what_to_make_next(date_from: str | None = None, date_to: str | None = None) -> dict:
        return await metrics.what_to_make_next(db, period_from(date_from, date_to))

    async def get_shelf_state() -> dict:
        return await metrics.shelf_state(db)

    async def get_best_sellers(
        date_from: str | None = None, date_to: str | None = None, limit: int = 10
    ) -> dict:
        return await metrics.best_sellers(db, period_from(date_from, date_to), limit=limit)

    async def get_funnel(date_from: str | None = None, date_to: str | None = None) -> dict:
        return await analytics.funnel(db, period_from(date_from, date_to))

    async def get_piece_performance(
        date_from: str | None = None, date_to: str | None = None
    ) -> dict:
        return await analytics.by_product(db, period_from(date_from, date_to))

    async def get_screen_performance(
        date_from: str | None = None, date_to: str | None = None
    ) -> dict:
        return await analytics.by_page(db, period_from(date_from, date_to))

    async def get_unmet_demand(date_from: str | None = None, date_to: str | None = None) -> dict:
        return await analytics.unmet_demand(db, period_from(date_from, date_to))

    async def forecast_next_week() -> dict:
        return await forecast.next_seven_days(db)

    async def explain_kpi(name: str) -> dict:
        """Teach, do not compute. A number the owner does not understand
        changes no decision."""
        entry = KPI_EXPLANATIONS.get(name)
        if entry is None:
            return {"error": f"No explanation for '{name}'", "known": sorted(KPI_EXPLANATIONS)}
        return {"kpi": name, "explanation": entry[1 if lang == "ar" else 0]}

    implementations = {
        "get_pulse": get_pulse,
        "get_revenue": get_revenue,
        "get_refusals": get_refusals,
        "get_conversion": get_conversion,
        "what_to_make_next": what_to_make_next,
        "get_shelf_state": get_shelf_state,
        "get_best_sellers": get_best_sellers,
        "get_funnel": get_funnel,
        "get_piece_performance": get_piece_performance,
        "get_screen_performance": get_screen_performance,
        "get_unmet_demand": get_unmet_demand,
        "forecast_next_week": forecast_next_week,
        "explain_kpi": explain_kpi,
    }

    _STR = {"type": "string"}
    _INT = {"type": "integer"}
    _PERIOD = {"date_from": _STR, "date_to": _STR}
    specs = [
        spec("get_pulse", "Today: orders, cash collected, visitors, what is waiting on you.", {}),
        spec("get_revenue", "Money collected over a period, against the period before it.", _PERIOD),
        spec(
            "get_refusals",
            "Packages refused at the door, as a rate, and the worst cities. The key metric.",
            _PERIOD,
        ),
        spec("get_conversion", "Visitors, carts and orders, and the rates between them.", _PERIOD),
        spec(
            "what_to_make_next",
            "What people asked us to make, searched for, and which categories pull attention.",
            _PERIOD,
        ),
        spec("get_shelf_state", "What is running out and what has not sold in six weeks.", {}),
        spec(
            "get_funnel",
            "Where people stop: came, saw a piece, opened one, read it, carted it, ordered. "
            "Counts people, so the biggest drop between two steps is the biggest problem.",
            _PERIOD,
        ),
        spec(
            "get_piece_performance",
            "Per piece: how many people saw it, opened it, stayed on it, carted it, bought it. "
            "Use to answer which pieces are working and which are not.",
            _PERIOD,
        ),
        spec(
            "get_screen_performance",
            "Per screen: how many people, how far they scrolled, how long they stayed.",
            _PERIOD,
        ),
        spec(
            "get_unmet_demand",
            "Searches that came back with nothing, and custom requests grouped by category. "
            "The most direct evidence of what to make that does not exist yet.",
            _PERIOD,
        ),
        spec(
            "forecast_next_week",
            "Expected sales of each piece over the next seven days, with a range, how many to "
            "make, and why. Say the range and the confidence, never the single number alone.",
            {},
        ),
        spec("get_best_sellers", "Pieces ranked by money collected.", {**_PERIOD, "limit": _INT}),
        spec(
            "explain_kpi",
            "What a metric means and what moves it. Use whenever a figure deserves it.",
            {"name": {"type": "string", "enum": sorted(KPI_EXPLANATIONS)}},
            required=["name"],
        ),
    ]

    return Toolbox(
        system_prompt=SYSTEM_PROMPT,
        specs=specs,
        run=lambda name, arguments: dispatch(implementations, name, arguments),
    )
