"""What the store learns from.

One row per interaction. The old recommendation service kept a JSON blob of
running totals per visitor, which cannot be recomputed, cannot be decayed after
the fact, and cannot answer "what were people looking at last Tuesday". Rows
can.

This is also the workshop's demand sensor (BRAND.md §5): the table that decides
what a visitor sees next is the same one that answers *what should I make
next*. A reseller cannot run that loop — their stock was committed months ago,
in a container, before anyone clicked anything.

There is no rolled-up profile table here. Affinity is derived from these rows,
and deriving it over a few hundred thousand rows is a fast query, not a reason
for a cache that can go stale. The cache gets added when a real query is
actually slow, not before — that was the microservices mistake, in miniature.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db import Base
from app.models.base import uuid_pk


class SignalType(str, PyEnum):
    impression = "impression"
    click = "click"
    dwell = "dwell"
    scroll_depth = "scroll_depth"
    search = "search"
    add_to_cart = "add_to_cart"
    purchase = "purchase"


#: REBUILD-PLAN §3.1. `dwell` is scored from how long, not by a flat number —
#: see `dwell_weight`.
SIGNAL_WEIGHTS: dict[SignalType, float] = {
    SignalType.impression: 1.0,
    SignalType.click: 3.0,
    SignalType.dwell: 1.0,
    SignalType.scroll_depth: 2.0,
    SignalType.search: 4.0,
    SignalType.add_to_cart: 8.0,
    SignalType.purchase: 10.0,
}

#: Interest halves every seven days, so the feed reflects this month rather
#: than this year.
AFFINITY_HALF_LIFE_DAYS = 7.0

#: Beyond this, longer dwell stops meaning more interest and starts meaning a
#: tab left open.
MAX_DWELL_WEIGHT = 6.0


class Signal(Base):
    """One interaction.

    Identified by `visitor_id` — the fingerprint the frontend already sets —
    because most buyers never sign in. `user_id` is filled in as well when
    there is an account, so signing in later keeps the history instead of
    starting from nothing.
    """

    __tablename__ = "signals"
    __table_args__ = (
        # The feed's hot path: everything one visitor did recently.
        Index("ix_signals_visitor_recent", "visitor_id", "created_at"),
        # "What has been earning attention this week" — the owner's question.
        Index("ix_signals_product_recent", "product_id", "created_at"),
        Index("ix_signals_category_recent", "category_id", "created_at"),
        # "What is happening on each screen this week" — the analytics table.
        Index("ix_signals_path_recent", "path", "created_at"),
        # Every analytics query is "this period, grouped by something", and
        # without this each one is a sequential scan of the whole table.
        Index("ix_signals_recent", "created_at"),
    )

    id: Mapped[str] = uuid_pk()
    visitor_id: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    type: Mapped[SignalType] = mapped_column(Enum(SignalType, name="signal_type"), nullable=False)
    weight: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False)

    product_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("products.id", ondelete="CASCADE"), nullable=True
    )
    # Denormalised from the product at write time. The feed groups by category
    # constantly, and a product can be recategorised — what the visitor was
    # actually looking at then is what the signal should say.
    category_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("categories.id", ondelete="CASCADE"), nullable=True
    )
    # For `search`: what they typed. Explicit intent, and the most direct answer
    # the owner has to "what are people asking us for that we don't make".
    query: Mapped[str | None] = mapped_column(Text, nullable=True)
    # `dwell`: seconds on the page. `scroll_depth`: percent through a list.
    # `search`: how many pieces came back — which is what makes "they searched
    # and we had nothing" a question the database can answer.
    value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Which screen it happened on, as the *route pattern* — `/piece/[slug]`,
    #: never `/piece/matte-black-hook`, and never `/track/<token>` with the
    #: token in it. Two reasons, and the second is the important one: patterns
    #: group, so "how far do people get down the shelf" is one GROUP BY; and a
    #: real URL here would put someone's tracking token in an analytics table
    #: that the whole owner panel reads.
    path: Mapped[str | None] = mapped_column(String(60), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FeedWeight(Base):
    """The ranking function's coefficients, in the database.

    REBUILD-PLAN §3.3 puts these here rather than in code so the owner can tune
    what the store pushes — promote new arrivals this week, stop pushing a
    batch that is not moving — without a deploy and without asking anyone.
    """

    __tablename__ = "feed_weights"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


#: Starting coefficients, seeded on first read. `fatigue` is subtracted; the
#: rest are added. Each is explained to the owner in the panel by
#: `FEED_WEIGHT_COPY` below rather than by these names.
DEFAULT_FEED_WEIGHTS: dict[str, float] = {
    "affinity": 1.0,
    "semantic": 0.8,
    "popular": 0.4,
    "fresh": 0.3,
    "business": 0.5,
    "fatigue": 0.6,
}

#: What each lever actually does, in both languages. The panel should make the
#: owner better at running the shop, not just expose six sliders.
FEED_WEIGHT_COPY: dict[str, tuple[str, str]] = {
    "affinity": (
        "How much someone's own browsing decides what they see next.",
        "إلى أي حد يقرّر تصفّح الزائر ما سيراه بعد ذلك.",
    ),
    "semantic": (
        "How much we show things that feel like what they liked, even from another category.",
        "إلى أي حد نعرض ما يشبه ما أعجبه، ولو من فئة أخرى.",
    ),
    "popular": (
        "How much what everyone else is looking at this week counts.",
        "إلى أي حد يهمّ ما ينظر إليه الآخرون هذا الأسبوع.",
    ),
    "fresh": (
        "How much we push what we made recently.",
        "إلى أي حد ندفع بما صنعناه حديثاً.",
    ),
    "business": (
        "How much your own boost on a piece counts.",
        "إلى أي حد يُحتسب تفضيلك الخاص لقطعة ما.",
    ),
    "fatigue": (
        "How hard we push down a piece someone has already been shown.",
        "إلى أي حد نُنزل قطعة سبق أن رآها الزائر.",
    ),
}
