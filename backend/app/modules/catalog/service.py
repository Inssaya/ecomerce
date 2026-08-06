"""Turning rows into what a page needs.

Every catalog endpoint used to build its own dict out of a Product. Doing that
in the routes meant the "which language, which photo is primary" logic was
repeated and drifted. It lives here, once, and the routes just call it.
"""
from __future__ import annotations

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import selectinload

from app.models import Category, Product, ProductMedia, ProductStatus
from app.modules.catalog.schemas import (
    CategoryNode,
    MediaResponse,
    ProductAdmin,
    ProductCard,
    ProductDetail,
)


def with_media(query: Select) -> Select:
    return query.options(selectinload(Product.media), selectinload(Product.category))


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
        sort_order=item.sort_order,
    )


def to_card(product: Product, lang: str) -> ProductCard:
    return ProductCard(
        id=product.id,
        slug=product.slug,
        title=product.title(lang),
        price=float(product.price),
        stock=product.stock,
        image=primary_image(product),
        category_slug=product.category.slug if product.category else None,
    )


def to_detail(product: Product, lang: str) -> ProductDetail:
    return ProductDetail(
        **to_card(product, lang).model_dump(),
        description=product.description(lang),
        images=[media_out(item, lang) for item in product.media],
        created_at=product.created_at,
    )


def to_admin(product: Product) -> ProductAdmin:
    return ProductAdmin(
        id=product.id,
        slug=product.slug,
        title_en=product.title_en,
        title_ar=product.title_ar,
        description_en=product.description_en,
        description_ar=product.description_ar,
        price=float(product.price),
        stock=product.stock,
        category_id=product.category_id,
        status=product.status,
        images=[media_out(item, "en") for item in product.media],
        created_at=product.created_at,
    )


def build_tree(categories: list[Category], lang: str) -> list[CategoryNode]:
    """One query in, a nested tree out — no recursive per-node lookups."""
    nodes = {
        category.id: CategoryNode(
            id=category.id,
            slug=category.slug,
            name=category.name(lang),
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


def text_match(term: str):
    """Keyword matching across both languages.

    This is what replaces Meilisearch. A `%term%` match over four columns is
    honest for a catalogue this size, and Phase 1 puts a real tsvector and a
    pgvector neighbour search behind the same endpoint.
    """
    pattern = f"%{term.strip()}%"
    return or_(
        Product.title_en.ilike(pattern),
        Product.title_ar.ilike(pattern),
        Product.description_en.ilike(pattern),
        Product.description_ar.ilike(pattern),
    )


def visible() -> Select:
    """The storefront only ever sees active products."""
    return with_media(select(Product).where(Product.status == ProductStatus.active))
