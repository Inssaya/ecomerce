"""Recording what people do.

Phase 1 writes the signals. Phase 2 reads them and ranks with them — the
ordering function, the explore/exploit split and the fatigue penalty all live
on top of this table, and none of it can be built before the table has been
collecting for a while.

Which is the real reason this ships now: a recommender with no history is
worse than no recommender. The sooner rows accumulate, the sooner the feed has
something true to say.
"""
from __future__ import annotations

import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MAX_DWELL_WEIGHT, SIGNAL_WEIGHTS, Product, Signal, SignalType


def dwell_weight(seconds: int | None) -> float:
    """`log₂(seconds + 1)`, capped.

    Linear time would let one tab left open outweigh fifty genuine visits.
    Logarithmic says: the difference between 2 seconds and 20 is real, the
    difference between 200 and 2000 is somebody who walked away.
    """
    if not seconds or seconds <= 0:
        return 0.0
    return min(math.log2(seconds + 1), MAX_DWELL_WEIGHT)


def weight_for(signal_type: SignalType, value: int | None) -> float:
    if signal_type is SignalType.dwell:
        return dwell_weight(value)
    return SIGNAL_WEIGHTS[signal_type]


#: The screens, as patterns. Anything not in here is not recorded.
#:
#: The client already knows its own route and could simply send the pattern —
#: but then a bug or a stray caller could put `/track/9f3a…` into a table the
#: whole owner panel reads, and someone's tracking token is their credential.
#: So the server reduces whatever it is given, and an unrecognised path is
#: dropped rather than stored. An allowlist is the only version of this that
#: cannot leak.
PATHS: dict[str, str] = {
    "": "/",
    "store": "/store",
    "cart": "/cart",
    "checkout": "/checkout",
    "ask": "/ask",
    "orders": "/orders",
    "workshop": "/workshop",
    "ambient": "/ambient",
}

#: First segment → the pattern it collapses to, whatever follows it.
PATH_PREFIXES: dict[str, str] = {
    "piece": "/piece/[slug]",
    "track": "/track/[token]",
    "request": "/request/[token]",
}


def clean_path(raw: str | None) -> str | None:
    """Reduce a path to one of `PATHS`, or to nothing.

    Drops the language prefix, because `/en/store` and `/ar/store` are one
    screen and splitting them would halve every count for no insight — the
    language is already its own column on the visitor's other signals.
    """
    if not raw:
        return None
    # A full URL, a query string or a fragment can all arrive here.
    trimmed = raw.split("?", 1)[0].split("#", 1)[0]
    segments = [part for part in trimmed.split("/") if part]
    if segments and segments[0] in {"en", "ar"}:
        segments = segments[1:]

    if not segments:
        return "/"
    if segments[0] in PATH_PREFIXES:
        return PATH_PREFIXES[segments[0]]
    return PATHS.get(segments[0])


async def record(
    db: AsyncSession,
    *,
    visitor_id: str,
    user_id: str | None,
    signal_type: SignalType,
    product_id: str | None = None,
    category_id: str | None = None,
    query: str | None = None,
    value: int | None = None,
    path: str | None = None,
) -> Signal | None:
    """One interaction. Returns None when the signal carries no information
    (a zero-second dwell, a product that no longer exists)."""
    weight = weight_for(signal_type, value)
    if weight <= 0:
        return None

    # Denormalise the category from the product at write time: a product can be
    # recategorised later, and what the visitor was looking at *then* is what
    # the signal should keep saying.
    if product_id and category_id is None:
        category_id = await db.scalar(select(Product.category_id).where(Product.id == product_id))
        if category_id is None and not await db.scalar(
            select(Product.id).where(Product.id == product_id)
        ):
            return None

    signal = Signal(
        visitor_id=visitor_id,
        user_id=user_id,
        type=signal_type,
        weight=weight,
        product_id=product_id,
        category_id=category_id,
        query=(query or None),
        value=value,
        path=clean_path(path),
    )
    db.add(signal)
    return signal
