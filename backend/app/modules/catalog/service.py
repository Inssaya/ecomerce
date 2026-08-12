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
    AttributeGroup,
    Category,
    Piece,
    PieceState,
    Product,
    ProductAttribute,
    ProductKind,
    ProductMedia,
    ProductStatus,
)
from app.modules.catalog.schemas import (
    AttributeOut,
    AttributeSuggestions,
    CategoryNode,
    ColorSuggestion,
    MediaResponse,
    PieceOut,
    ProductAdmin,
    ProductCard,
    ProductDetail,
    VariantOut,
)

LOADED = (
    selectinload(Product.media),
    # The parent comes along because a product filed under "Oversize" has to
    # report "T-Shirts · Oversize", and reading `category.parent` lazily inside
    # an async request raises rather than emitting a query.
    selectinload(Product.category).selectinload(Category.parent),
    selectinload(Product.variants),
    selectinload(Product.attributes),
)


def with_relations(query: Select) -> Select:
    return query.options(*LOADED)


def visible() -> Select:
    """The storefront only ever sees published pieces."""
    return with_relations(select(Product).where(Product.status == ProductStatus.active))


# `availability()` and `variant_availability()` used to live here, counting
# `Piece` rows in state `available` for a page of cards. They are gone with the
# shelf: the shop makes what is ordered, so there is no number of units to
# count and nothing can be sold out. Every `available` field the API still
# carries reports `None`, which has always meant "nothing to run out of".


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


def to_card(product: Product, lang: str) -> ProductCard:
    return ProductCard(
        id=product.id,
        slug=product.slug,
        kind=product.kind,
        title=product.title(lang),
        price=float(product.price),
        price_max=float(product.price_max) if product.price_max is not None else None,
        image=primary_image(product),
        category_slug=product.category.slug if product.category else None,
        category_name=product.category.name(lang) if product.category else None,
        available=None,
        lead_time_days=product.delivery_days or product.lead_time_days,
        effective_price=product.effective_price(),
        discount_active=product.discount_active,
    )


def variants_out(product: Product, lang: str) -> list[VariantOut]:
    return [
        VariantOut(
            id=variant.id,
            sku=variant.sku,
            option=variant.option(lang),
            price=float(variant.price if variant.price is not None else product.price),
            available=None,
        )
        for variant in product.variants
        if variant.is_active
    ]


def to_detail(product: Product, lang: str) -> ProductDetail:
    return ProductDetail(
        **to_card(product, lang).model_dump(),
        description=product.description(lang),
        story=product.story(lang),
        images=[media_out(item, lang) for item in product.media],
        variants=variants_out(product, lang),
        # Empty, always. The numbered tally said "we made twelve, four are
        # left" — a sentence about stock, which is not something this shop has.
        pieces=[],
        show_piece_numbers=False,
        batch_closed=product.batch_closed,
        made_on=product.made_on,
        created_at=product.created_at,
        attributes=[attribute_out(item) for item in product.attributes],
        personalizable=product.personalizable,
        personalization_markup_pct=float(product.personalization_markup_pct or 0),
    )


def attribute_out(attribute: ProductAttribute) -> AttributeOut:
    return AttributeOut(
        id=attribute.id,
        group=attribute.group,
        name=attribute.name,
        value=attribute.value,
        hex=attribute.hex,
        display_order=attribute.display_order,
        label=attribute.label,
    )


def category_names(product: Product) -> tuple[str | None, str | None]:
    """The pair the console's two columns want: line of work, then branch.

    A product is filed under exactly one node. If that node has a parent, the
    parent is the category and the node is the subcategory; if it does not,
    there is no subcategory to name — rather than repeating the category in
    both columns, which reads as a mistake.
    """
    node = product.category
    if node is None:
        return None, None
    if node.parent is not None:
        return node.parent.name_en, node.name_en
    return node.name_en, None


def to_admin(product: Product, *, likes: int = 0, saves: int = 0) -> ProductAdmin:
    category_name, subcategory_name = category_names(product)
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
        category_name=category_name,
        subcategory_name=subcategory_name,
        status=product.status,
        images=[media_out(item, "en") for item in product.media],
        variants=variants_out(product, "en"),
        attributes=[attribute_out(item) for item in product.attributes],
        available=None,
        lead_time_days=product.lead_time_days,
        delivery_days=product.delivery_days,
        personalizable=product.personalizable,
        personalization_markup_pct=float(product.personalization_markup_pct or 0),
        discount_kind=product.discount_kind,
        discount_value=(
            float(product.discount_value) if product.discount_value is not None else None
        ),
        discount_active=product.discount_active,
        effective_price=product.effective_price(),
        total_likes=likes,
        total_saves=saves,
        made_on=product.made_on,
        batch_closed=product.batch_closed,
        show_piece_numbers=product.show_piece_numbers,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


# ── Specification suggestions ─────────────────────────────────────────────────
#
# Starting points, not a taxonomy. The owner's own words were that these are
# "only examples" and that they may add them or not — so the dropdown offers
# these plus everything the shop has already used, and typing something new is
# always allowed. That is why there is no table of allowed values anywhere: a
# vocabulary that has to be administered is a vocabulary nobody maintains.

PRESET_MEASURE_NAMES = ("Width", "Height", "Length", "Depth", "Diameter", "Weight")
PRESET_MEASURE_VALUES = ("S", "M", "L", "XL", "XXL")
PRESET_MATERIAL_NAMES = ("Fabric", "Frame", "Finish", "Lining")
PRESET_MATERIAL_VALUES = ("Wood", "Metal", "Cotton 100%", "Leather", "Plastic", "Glass")
PRESET_COLORS: tuple[tuple[str, str], ...] = (
    ("Black", "#1A1A1A"),
    ("White", "#F5F5F0"),
    ("Cream", "#EFE6D8"),
    ("Sand", "#D8C7AE"),
    ("Clay", "#B4785A"),
    ("Brown", "#6B4A34"),
    ("Olive", "#6B7355"),
    ("Navy", "#26364F"),
    ("Grey", "#8A8A8A"),
    ("Red", "#A6342E"),
)


async def attribute_suggestions(db: AsyncSession) -> AttributeSuggestions:
    """The presets, plus whatever this shop already says."""
    rows = (
        await db.execute(
            select(
                ProductAttribute.group,
                ProductAttribute.name,
                ProductAttribute.value,
                ProductAttribute.hex,
            ).distinct()
        )
    ).all()

    names: dict[AttributeGroup, set[str]] = {group: set() for group in AttributeGroup}
    values: dict[AttributeGroup, set[str]] = {group: set() for group in AttributeGroup}
    colors: dict[str, str | None] = {value: hex_ for value, hex_ in PRESET_COLORS}

    for group, name, value, hex_ in rows:
        if name:
            names[group].add(name)
        if group is AttributeGroup.color:
            # A colour the shop has used wins over the preset of the same name:
            # if the workshop corrected the swatch, that is the real one.
            colors[value] = hex_ or colors.get(value)
        else:
            values[group].add(value)

    def merged(preset: tuple[str, ...], seen: set[str]) -> list[str]:
        # Case-insensitive so "wood" typed once does not sit beside "Wood".
        out = {item.casefold(): item for item in preset}
        out.update({item.casefold(): item for item in seen})
        return sorted(out.values(), key=str.casefold)

    return AttributeSuggestions(
        measure_names=merged(PRESET_MEASURE_NAMES, names[AttributeGroup.measure]),
        measure_values=merged(PRESET_MEASURE_VALUES, values[AttributeGroup.measure]),
        material_names=merged(PRESET_MATERIAL_NAMES, names[AttributeGroup.material]),
        material_values=merged(PRESET_MATERIAL_VALUES, values[AttributeGroup.material]),
        colors=[
            ColorSuggestion(value=value, hex=hex_)
            for value, hex_ in sorted(colors.items(), key=lambda pair: pair[0].casefold())
        ],
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
