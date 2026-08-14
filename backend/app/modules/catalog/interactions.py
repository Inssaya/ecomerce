"""Hearts and buy-later saves.

The endpoints are toggles rather than post/delete pairs because the buttons on
the storefront are toggles: pressing "like" twice is the same as pressing it
once — the row exists, or it does not. The unique constraint on
`(product_id, visitor_id, kind)` is what makes that safe under a double-tap.

Aggregating stays a plain `count(*)`. There is no rolled-up totals table, and
there will not be one until a real query is actually slow — the microservices
mistake was caching things that were fast, in miniature.
"""
from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import InteractionKind, ProductInteraction


async def toggle(
    db: AsyncSession,
    *,
    product_id: str,
    visitor_id: str,
    user_id: str | None,
    kind: InteractionKind,
) -> bool:
    """Insert the row, or delete it. Returns the state the visitor ended in.

    Written as an upsert-then-check rather than "select, then decide, then
    write" because two taps from the same device racing each other must not
    end with two rows. The unique constraint on `(product_id, visitor_id,
    kind)` makes the insert idempotent and the delete unambiguous.
    """
    statement = (
        insert(ProductInteraction)
        .values(
            product_id=product_id,
            visitor_id=visitor_id,
            user_id=user_id,
            kind=kind,
        )
        .on_conflict_do_nothing(index_elements=["product_id", "visitor_id", "kind"])
        .returning(ProductInteraction.id)
    )
    inserted = (await db.execute(statement)).first()
    if inserted is not None:
        await db.commit()
        return True

    # The row already existed — this press was the second one, undoing it.
    await db.execute(
        delete(ProductInteraction).where(
            ProductInteraction.product_id == product_id,
            ProductInteraction.visitor_id == visitor_id,
            ProductInteraction.kind == kind,
        )
    )
    await db.commit()
    return False


async def state_for(
    db: AsyncSession, *, product_id: str, visitor_id: str | None
) -> dict:
    """The counts anyone can see, plus whether this visitor pressed either.

    Reported in one call so the storefront's heart button paints correctly on
    the first load: without the visitor's own state it would flash unpressed
    for the first tick and pressed for the second.
    """
    totals = dict(
        (
            await db.execute(
                select(ProductInteraction.kind, func.count())
                .where(ProductInteraction.product_id == product_id)
                .group_by(ProductInteraction.kind)
            )
        ).all()
    )
    mine = {InteractionKind.like: False, InteractionKind.save: False}
    if visitor_id:
        rows = await db.scalars(
            select(ProductInteraction.kind).where(
                ProductInteraction.product_id == product_id,
                ProductInteraction.visitor_id == visitor_id,
            )
        )
        for kind in rows:
            mine[kind] = True

    return {
        "likes": int(totals.get(InteractionKind.like, 0)),
        "saves": int(totals.get(InteractionKind.save, 0)),
        "liked": mine[InteractionKind.like],
        "saved": mine[InteractionKind.save],
    }


async def totals_for(
    db: AsyncSession, product_ids: list[str]
) -> dict[str, tuple[int, int]]:
    """Likes and saves per product, for a whole page in one query."""
    if not product_ids:
        return {}
    rows = (
        await db.execute(
            select(
                ProductInteraction.product_id,
                ProductInteraction.kind,
                func.count(),
            )
            .where(ProductInteraction.product_id.in_(product_ids))
            .group_by(ProductInteraction.product_id, ProductInteraction.kind)
        )
    ).all()
    out: dict[str, tuple[int, int]] = {}
    for product_id, kind, count in rows:
        likes, saves = out.get(product_id, (0, 0))
        if kind is InteractionKind.like:
            out[product_id] = (int(count), saves)
        else:
            out[product_id] = (likes, int(count))
    return out
