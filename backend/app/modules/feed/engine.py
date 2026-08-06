"""The feed — the part that makes the store feel like it knows you.

REBUILD-PLAN §3. Scoring happens in one SQL statement rather than in Python,
for a reason that matters: the alternative is fetching every product and every
visitor's signals into the process and joining them by hand, which is both
slower and the sort of thing that quietly becomes N+1.

    score = w_affinity · affinity(visitor, category)
          + w_semantic · cosine(visitor_vector, product_embedding)
          + w_popular  · popularity_7d
          + w_fresh    · recency
          + w_business · business_boost
          − w_fatigue  · times_already_shown

The explore/exploit split is done in Python afterwards, because it is a
sequencing decision rather than a scoring one: which slots on the page go to
what the visitor already likes, and which go to something they have not seen.
Page 1 for a new visitor is a broad, beautiful sample. By page 3 it is visibly
their store. ε never reaches zero — there is always room to be surprised.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AFFINITY_HALF_LIFE_DAYS,
    DEFAULT_FEED_WEIGHTS,
    FeedWeight,
    Product,
)

#: Never fewer than this share of the page is discovery, however well we think
#: we know someone. A feed that only ever confirms itself stops selling.
MIN_EXPLORE = 0.15
#: How fast confidence grows with evidence.
EXPLORE_DECAY = 0.05
#: No page is more than this much of one category, however well it scores.
#: Monotony reads as a small shop even when the shop is not small.
MAX_PER_CATEGORY = 6
#: Signals older than this stop counting. Interest goes stale.
SIGNAL_WINDOW_DAYS = 90


@dataclass(slots=True)
class Scored:
    product_id: str
    category_id: str | None
    score: float
    explore: bool


async def weights(db: AsyncSession) -> dict[str, float]:
    """The owner's coefficients, seeded on first read."""
    rows = {row.key: float(row.value) for row in await db.scalars(select(FeedWeight))}
    missing = {key: value for key, value in DEFAULT_FEED_WEIGHTS.items() if key not in rows}
    if missing:
        db.add_all(FeedWeight(key=key, value=value) for key, value in missing.items())
        await db.commit()
        rows.update(missing)
    return rows


def explore_ratio(signal_mass: float) -> float:
    """ε — how much of the page is discovery.

    A visitor we know nothing about gets a page that is entirely discovery,
    because we have nothing better to offer than breadth. It narrows as
    evidence accumulates and settles at `MIN_EXPLORE`.
    """
    return max(MIN_EXPLORE, 1.0 / (1.0 + EXPLORE_DECAY * max(signal_mass, 0.0)))


#: One statement. The CTEs are, in order: what this visitor cares about,
#: where they sit in meaning-space, what everyone is looking at this week, and
#: what this visitor has already been shown.
_SCORING_SQL = text(
    """
WITH affinity AS (
    SELECT category_id,
           SUM(weight * POWER(0.5, EXTRACT(EPOCH FROM (now() - created_at))
                                   / 86400.0 / :half_life)) AS raw
    FROM signals
    WHERE visitor_id = :visitor
      AND category_id IS NOT NULL
      AND created_at > now() - make_interval(days => :window_days)
    GROUP BY category_id
),
affinity_scaled AS (
    SELECT category_id, raw / NULLIF((SELECT MAX(raw) FROM affinity), 0) AS score
    FROM affinity
),
visitor_vector AS (
    SELECT AVG(e.embedding) AS centre
    FROM signals s
    JOIN product_embeddings e ON e.product_id = s.product_id
    WHERE s.visitor_id = :visitor
      AND s.created_at > now() - make_interval(days => :window_days)
),
popularity AS (
    SELECT product_id, SUM(weight) AS raw
    FROM signals
    WHERE product_id IS NOT NULL AND created_at > now() - interval '7 days'
    GROUP BY product_id
),
fatigue AS (
    SELECT product_id, COUNT(*) AS shown
    FROM signals
    WHERE visitor_id = :visitor
      AND type = 'impression'
      AND product_id IS NOT NULL
      AND created_at > now() - interval '14 days'
    GROUP BY product_id
)
SELECT
    p.id AS product_id,
    p.category_id,
    COALESCE(a.score, 0)                                        AS affinity,
    CASE
        WHEN v.centre IS NULL OR e.embedding IS NULL THEN 0
        ELSE GREATEST(0, 1 - (e.embedding <=> v.centre))
    END                                                          AS semantic,
    COALESCE(pop.raw, 0) / NULLIF((SELECT MAX(raw) FROM popularity), 0) AS popular,
    -- Freshness halves every 30 days, so "new" fades instead of cliff-edging.
    POWER(0.5, EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400.0 / 30.0) AS fresh,
    p.business_boost                                             AS business,
    -- Diminishing: the 2nd showing costs much more than the 12th, because by
    -- then the visitor has already decided.
    LN(1 + COALESCE(f.shown, 0))                                 AS fatigue
FROM products p
CROSS JOIN visitor_vector v
LEFT JOIN affinity_scaled a ON a.category_id = p.category_id
LEFT JOIN product_embeddings e ON e.product_id = p.id
LEFT JOIN popularity pop ON pop.product_id = p.id
LEFT JOIN fatigue f ON f.product_id = p.id
WHERE p.status = 'active'
  AND (
      p.kind = 'workshop'
      OR EXISTS (
          SELECT 1 FROM pieces pc
          WHERE pc.product_id = p.id AND pc.state = 'available'
      )
  )
"""
)


async def signal_mass(db: AsyncSession, visitor_id: str) -> float:
    """Total decayed evidence about one visitor."""
    value = await db.scalar(
        text(
            """
            SELECT COALESCE(SUM(weight * POWER(0.5,
                EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0 / :half_life)), 0)
            FROM signals
            WHERE visitor_id = :visitor
              AND created_at > now() - make_interval(days => :window_days)
            """
        ),
        {
            "visitor": visitor_id,
            "half_life": AFFINITY_HALF_LIFE_DAYS,
            "window_days": SIGNAL_WINDOW_DAYS,
        },
    )
    return float(value or 0)


async def score_all(db: AsyncSession, visitor_id: str) -> list[Scored]:
    coefficients = await weights(db)
    rows = (
        await db.execute(
            _SCORING_SQL,
            {
                "visitor": visitor_id,
                "half_life": AFFINITY_HALF_LIFE_DAYS,
                "window_days": SIGNAL_WINDOW_DAYS,
            },
        )
    ).mappings()

    scored: list[Scored] = []
    for row in rows:
        score = (
            coefficients["affinity"] * float(row["affinity"] or 0)
            + coefficients["semantic"] * float(row["semantic"] or 0)
            + coefficients["popular"] * float(row["popular"] or 0)
            + coefficients["fresh"] * float(row["fresh"] or 0)
            + coefficients["business"] * float(row["business"] or 1)
            - coefficients["fatigue"] * float(row["fatigue"] or 0)
        )
        # asyncpg decodes a uuid column to `UUID`, while the mapped columns are
        # `UUID(as_uuid=False)` and therefore `str`. Mixing the two silently
        # loses every row at the lookup that turns ids back into products.
        scored.append(
            Scored(
                product_id=str(row["product_id"]),
                category_id=str(row["category_id"]) if row["category_id"] else None,
                # An affinity of exactly zero means this category is not one
                # the visitor has touched — so it is discovery, not a weak
                # recommendation.
                explore=not float(row["affinity"] or 0),
                score=score,
            )
        )
    return scored


def arrange(scored: list[Scored], *, ratio: float, size: int, offset: int) -> list[Scored]:
    """Lay out one page: exploit slots, explore slots, interleaved.

    Interleaved rather than appended, because explore items clumped at the
    bottom of a page are explore items nobody sees.
    """
    exploit = sorted(
        (item for item in scored if not item.explore), key=lambda item: item.score, reverse=True
    )
    explore = sorted(
        (item for item in scored if item.explore), key=lambda item: item.score, reverse=True
    )

    def take(items: list[Scored], *, skip: int, limit: int) -> list[Scored]:
        """The next `limit` items after `skip`, no more than MAX_PER_CATEGORY
        of any one category on this page."""
        seen: dict[str | None, int] = {}
        kept: list[Scored] = []
        for item in items[skip:]:
            if len(kept) >= limit:
                break
            count = seen.get(item.category_id, 0)
            if item.category_id is not None and count >= MAX_PER_CATEGORY:
                continue
            seen[item.category_id] = count + 1
            kept.append(item)
        return kept

    want_explore = math.ceil(ratio * size)
    want_exploit = size - want_explore
    # Scrolling is not pagination through a fixed list, but a visitor must not
    # meet the same card twice on the way down either — each track skips what
    # the pages before it used.
    page = offset // size if size else 0

    chosen_exploit = take(exploit, skip=want_exploit * page, limit=want_exploit)
    chosen_explore = take(explore, skip=want_explore * page, limit=want_explore)

    # A short catalogue must never produce a half-empty screen: whichever track
    # runs dry, the other fills the gap.
    if len(chosen_exploit) < want_exploit:
        chosen_explore = take(
            explore,
            skip=want_explore * page,
            limit=want_explore + (want_exploit - len(chosen_exploit)),
        )
    if len(chosen_explore) < want_explore:
        chosen_exploit = take(
            exploit,
            skip=want_exploit * page,
            limit=want_exploit + (want_explore - len(chosen_explore)),
        )

    if not chosen_explore:
        return chosen_exploit[:size]
    if not chosen_exploit:
        return chosen_explore[:size]

    # Spread the explore items evenly through the page instead of grouping them.
    every = max(1, round(len(chosen_exploit) / len(chosen_explore)) or 1)
    laid_out: list[Scored] = []
    explore_iter = iter(chosen_explore)
    for index, item in enumerate(chosen_exploit):
        laid_out.append(item)
        if (index + 1) % every == 0:
            following = next(explore_iter, None)
            if following is not None:
                laid_out.append(following)
    laid_out.extend(explore_iter)
    return laid_out[:size]


async def page(
    db: AsyncSession, *, visitor_id: str, size: int, offset: int
) -> tuple[list[Product], float, int]:
    """The feed, as products, in order. Returns (products, ε, total)."""
    scored = await score_all(db, visitor_id)
    ratio = explore_ratio(await signal_mass(db, visitor_id))
    arranged = arrange(scored, ratio=ratio, size=size, offset=offset)
    if not arranged:
        return [], ratio, len(scored)

    from app.modules.catalog.service import with_relations  # local: avoids a cycle

    ordered_ids = [item.product_id for item in arranged]
    products = {
        product.id: product
        for product in (
            await db.scalars(with_relations(select(Product).where(Product.id.in_(ordered_ids))))
        ).unique()
    }
    return [products[pid] for pid in ordered_ids if pid in products], ratio, len(scored)
