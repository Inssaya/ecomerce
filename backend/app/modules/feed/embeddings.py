"""Putting pieces into meaning-space.

What gets embedded is the title, the description and the story, in both
languages, concatenated. The story matters: it is the part that says how a
thing was made, and it is what lets "hand-finished", "matte", "minimal" find
their way to the right pieces when none of those words is a category.

Re-embedding is skipped when the text has not changed — the hash on
`ProductEmbedding` is what that check reads. Embedding calls cost money and
rate-limit, and a product is saved far more often than its copy really changes.
"""
from __future__ import annotations

import hashlib
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import llm
from app.models import Product, ProductEmbedding, ProductStatus

logger = logging.getLogger(__name__)

#: One request per this many pieces, rather than one per piece.
BATCH_SIZE = 32


def source_text(product: Product) -> str:
    parts = [
        product.title_en,
        product.title_ar,
        product.description_en,
        product.description_ar,
        product.story_en,
        product.story_ar,
        product.category.name_en if product.category else "",
    ]
    return "\n".join(part.strip() for part in parts if part and part.strip())


def source_hash(text: str) -> str:
    # The model is part of the identity: switching models must re-embed
    # everything, because vectors from two models are not comparable.
    return hashlib.sha256(f"{settings.embedding_model}\n{text}".encode()).hexdigest()


async def refresh(db: AsyncSession, *, force: bool = False) -> dict[str, int]:
    """Embed every published piece whose copy has changed.

    Safe to run repeatedly — that is the point. Returns what it did so the
    owner's panel can say so plainly.
    """
    if not llm.is_configured():
        return {"embedded": 0, "skipped": 0, "unavailable": 1}

    products = list(
        await db.scalars(
            select(Product)
            .where(Product.status == ProductStatus.active)
            .execution_options(populate_existing=True)
        )
    )
    existing = {
        row.product_id: row for row in await db.scalars(select(ProductEmbedding))
    }

    pending: list[tuple[Product, str, str]] = []
    skipped = 0
    for product in products:
        text = source_text(product)
        if not text:
            continue
        digest = source_hash(text)
        current = existing.get(product.id)
        if not force and current is not None and current.source_hash == digest:
            skipped += 1
            continue
        pending.append((product, text, digest))

    embedded = 0
    for start in range(0, len(pending), BATCH_SIZE):
        chunk = pending[start : start + BATCH_SIZE]
        vectors = await llm.embed([text for _, text, _ in chunk])
        for (product, _, digest), vector in zip(chunk, vectors, strict=True):
            row = existing.get(product.id)
            if row is None:
                db.add(
                    ProductEmbedding(
                        product_id=product.id,
                        embedding=vector,
                        model=settings.embedding_model,
                        source_hash=digest,
                    )
                )
            else:
                row.embedding = vector
                row.model = settings.embedding_model
                row.source_hash = digest
            embedded += 1
        await db.commit()

    logger.info("Embeddings refreshed: %s written, %s unchanged", embedded, skipped)
    return {"embedded": embedded, "skipped": skipped, "unavailable": 0}


async def embed_query(text: str) -> list[float] | None:
    """Embed one search phrase. None when AI is not configured, so the caller
    falls back to keyword matching instead of failing."""
    if not llm.is_configured() or not text.strip():
        return None
    try:
        vectors = await llm.embed([text.strip()])
    except llm.LlmError as exc:
        logger.warning("Could not embed the query: %s", exc)
        return None
    return vectors[0] if vectors else None
