"""Turning rows into what a page needs.

Every catalog endpoint used to build its own dict out of a Product, so the
"which language, which photo is primary, how many are left" logic was repeated
and drifted between them. It lives here, once.

Availability is the thing worth reading closely: nothing in the system stores
"stock". For a shelf piece it is counted from the pieces that physically exist,
and for a made-to-order piece it is `None` — not zero, because zero would mean
sold out and it means the opposite.
"""
from __future__ import annotations

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Category,
    Piece,
    PieceState,
    Product,
    ProductKind,
    ProductMedia,
    ProductStatus,
)
from app.modules.catalog.schemas import (
    CategoryNode,
    MediaResponse,
    PieceOut,
    ProductAdmin,
    ProductCard,
    ProductDetail,
    VariantOut,
)

LOADED = (
    selectinload(Product.media),
    selectinload(Product.category),
    selectinload(Product.variants),
)


def with_relations(query: Select) -> Select:
    return query.options(*LOADED)


def visible() -> Select:
    """The storefront only ever sees published pieces."""
    return with_relations(select(Product).where(Product.status == ProductStatus.active))


async def availability(db: AsyncSession, product_ids: list[str]) -> dict[str, int]:
    """How many pieces of each product are still on the shelf.

    One grouped query for the whole page rather than a count per card.
    """
    if not product_ids:
        return {}
    rows = await db.execute(
        select(Piece.product_id, func.count())
        .where(Piece.product_id.in_(product_ids), Piece.state == PieceState.available)
        .group_by(Piece.product_id)
    )
    return dict(rows.all())


async def variant_availability(db: AsyncSession, product_id: str) -> dict[str, int]:
    rows = await db.execute(
        select(Piece.variant_id, func.count())
        .where(
            Piece.product_id == product_id,
            Piece.state == PieceState.available,
            Piece.variant_id.is_not(None),
        )
        .group_by(Piece.variant_id)
    )
    return dict(rows.all())


def primary_image(product: Product) -> str | None:
    if not product.media:
        return None
    for item in product.media:
        if item.is_primary:
            return item.url
    return product.media[0].url


def media_out(item: ProductMedia, lang: str) -> MediaResponse:
    return MediaResponse(
        id=item.id,
        url=item.url,
        alt=(item.alt_ar or item.alt_en) if lang == "ar" else item.alt_en,
        is_primary=item.is_primary,
        is_process_footage=item.is_process_footage,
        sort_order=item.sort_order,
    )


def to_card(product: Product, lang: str, available: int | None) -> ProductCard:
    shelf = product.kind is ProductKind.shelf
    return ProductCard(
        id=product.id,
        slug=product.slug,
        kind=product.kind,
        title=product.title(lang),
        price=float(product.price),
        price_max=float(product.price_max) if product.price_max is not None else None,
        image=primary_image(product),
        category_slug=product.category.slug if product.category else None,
        available=(available or 0) if shelf else None,
        lead_time_days=product.lead_time_days if not shelf else None,
    )


def variants_out(
    product: Product, lang: str, per_variant: dict[str, int] | None
) -> list[VariantOut]:
    shelf = product.kind is ProductKind.shelf
    return [
        VariantOut(
            id=variant.id,
            sku=variant.sku,
            option=variant.option(lang),
            price=float(variant.price if variant.price is not None else product.price),
            available=(per_variant or {}).get(variant.id, 0) if shelf else None,
        )
        for variant in product.variants
        if variant.is_active
    ]


def to_detail(
    product: Product,
    lang: str,
    *,
    available: int | None,
    per_variant: dict[str, int] | None,
    pieces: list[Piece],
) -> ProductDetail:
    return ProductDetail(
        **to_card(product, lang, available).model_dump(),
        description=product.description(lang),
        story=product.story(lang),
        images=[media_out(item, lang) for item in product.media],
        variants=variants_out(product, lang, per_variant),
        # Numbering is shown only when the workshop decided this batch earns
        # it. The rows exist either way — this is presentation, not inventory.
        pieces=(
            [
                PieceOut(
                    id=piece.id,
                    number=piece.number,
                    batch_size=piece.batch_size,
                    label=piece.label,
                    state=piece.state.value,
                    made_on=piece.made_on,
                    photo=piece.photo_url,
                    # A note belongs to one object and only matters while it is
                    # still buyable.
                    note=piece.note(lang) if piece.state is PieceState.available else "",
                )
                for piece in pieces
            ]
            if product.show_piece_numbers
            else []
        ),
        show_piece_numbers=product.show_piece_numbers,
        batch_closed=product.batch_closed,
        made_on=product.made_on,
        created_at=product.created_at,
    )


def to_admin(product: Product, available: int | None, per_variant: dict[str, int] | None) -> ProductAdmin:
    return ProductAdmin(
        id=product.id,
        slug=product.slug,
        kind=product.kind,
        title_en=product.title_en,
        title_ar=product.title_ar,
        description_en=product.description_en,
        description_ar=product.description_ar,
        story_en=product.story_en,
        story_ar=product.story_ar,
        price=float(product.price),
        price_max=float(product.price_max) if product.price_max is not None else None,
        business_boost=float(product.business_boost),
        category_id=product.category_id,
        status=product.status,
        images=[media_out(item, "en") for item in product.media],
        variants=variants_out(product, "en", per_variant),
        available=available if product.kind is ProductKind.shelf else None,
        lead_time_days=product.lead_time_days,
        made_on=product.made_on,
        batch_closed=product.batch_closed,
        show_piece_numbers=product.show_piece_numbers,
        created_at=product.created_at,
    )


def build_tree(categories: list[Category], lang: str) -> list[CategoryNode]:
    """One query in, a nested tree out — no recursive per-node lookups."""
    nodes = {
        category.id: CategoryNode(
            id=category.id,
            slug=category.slug,
            name=category.name(lang),
            icon_url=category.icon_url,
            display_order=category.display_order,
            children=[],
        )
        for category in categories
    }
    roots: list[CategoryNode] = []
    for category in categories:
        node = nodes[category.id]
        parent = nodes.get(category.parent_id) if category.parent_id else None
        (parent.children if parent else roots).append(node)
    for node in nodes.values():
        node.children.sort(key=lambda child: child.display_order)
    roots.sort(key=lambda node: node.display_order)
    return roots


async def descendant_ids(db: AsyncSession, root_id: str) -> list[str]:
    """A category page shows everything beneath it: choosing T-Shirts shows
    Oversize and Slim too."""
    pairs = (await db.execute(select(Category.id, Category.parent_id))).all()
    children: dict[str, list[str]] = {}
    for child_id, parent_id in pairs:
        children.setdefault(parent_id, []).append(child_id)

    collected = [root_id]
    frontier = [root_id]
    while frontier:
        for child in children.get(frontier.pop(), []):
            collected.append(child)
            frontier.append(child)
    return collected


def text_match(term: str):
    """Keyword matching across both languages.

    This is what replaces Meilisearch. `ILIKE` over four columns is honest for
    a catalogue this short, and Phase 2 puts the pgvector neighbour search
    behind the same endpoint for everything a keyword cannot reach.
    """
    pattern = f"%{term.strip()}%"
    return or_(
        Product.title_en.ilike(pattern),
        Product.title_ar.ilike(pattern),
        Product.description_en.ilike(pattern),
        Product.description_ar.ilike(pattern),
    )
