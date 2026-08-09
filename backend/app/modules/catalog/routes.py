"""The catalogue — public reads, owner writes."""
from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, UploadFile, status
from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import selectinload

from app.core.errors import bad_request, conflict, get_or_404
from app.core.limits import RequestLimit
from app.core.slug import unique_slug
from app.core.storage import MAX_IMAGE_BYTES, delete_object, sniff_image, upload_image
from app.deps import DbSession, Lang, Owner, Paging
from app.models import (
    Category,
    Piece,
    PieceState,
    Product,
    ProductKind,
    ProductMedia,
    ProductStatus,
    ProductVariant,
)
from app.modules.catalog import alerts, service
from app.modules.catalog.schemas import (
    AlertRequest,
    CategoryAdmin,
    CategoryNode,
    CategoryWrite,
    MediaResponse,
    PieceAdmin,
    PieceBatchWrite,
    ProductAdmin,
    ProductDetail,
    ProductPage,
    ProductPatch,
    ProductWrite,
    VariantOut,
    VariantWrite,
)
from app.modules.feed import embeddings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["catalog"])


# ── Categories ────────────────────────────────────────────────────────────────


@router.get("/categories", response_model=list[CategoryNode])
async def category_tree(db: DbSession, lang: Lang) -> list[CategoryNode]:
    rows = await db.scalars(
        select(Category).where(Category.is_active.is_(True)).order_by(Category.display_order)
    )
    return service.build_tree(list(rows), lang)


@router.get("/categories/{slug}", response_model=CategoryNode)
async def get_category(slug: str, db: DbSession, lang: Lang) -> CategoryNode:
    """One category, so its own page can 404 honestly and print its own name.

    A slug that does not exist is a real 404, not a category page listing
    nothing — the storefront's `resource()` helper depends on this exact
    distinction to keep dead URLs out of the index.
    """
    category = await db.scalar(
        select(Category).where(Category.slug == slug, Category.is_active.is_(True))
    )
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    # A leaf node is fine — the page is going to list its own products, not its
    # children, so the children field is unused here.
    return CategoryNode(
        id=category.id,
        slug=category.slug,
        name=category.name(lang),
        display_order=category.display_order,
    )


@router.get("/admin/categories", response_model=list[CategoryAdmin])
async def list_categories_admin(db: DbSession, owner: Owner) -> list[Category]:
    rows = await db.scalars(select(Category).order_by(Category.display_order))
    return list(rows)


@router.post("/admin/categories", response_model=CategoryAdmin, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryWrite, db: DbSession, owner: Owner) -> Category:
    if body.parent_id:
        await get_or_404(db, Category, body.parent_id, detail="Parent category not found")
    category = Category(
        **body.model_dump(),
        slug=await unique_slug(db, Category, body.name_en, fallback="category"),
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.patch("/admin/categories/{category_id}", response_model=CategoryAdmin)
async def update_category(
    category_id: str, body: CategoryWrite, db: DbSession, owner: Owner
) -> Category:
    category = await get_or_404(db, Category, category_id, detail="Category not found")
    if body.parent_id == category_id:
        raise bad_request("A category cannot be its own parent")
    for field, value in body.model_dump().items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return category


# ── Products, public ──────────────────────────────────────────────────────────


@router.get("/products", response_model=ProductPage)
async def list_products(
    db: DbSession,
    lang: Lang,
    paging: Paging,
    category: str | None = Query(default=None, description="Category slug"),
    kind: ProductKind | None = Query(default=None),
    q: str | None = Query(default=None, min_length=1, max_length=120),
    seed: int | None = Query(
        default=None,
        ge=0,
        le=2_147_483_647,
        description="Shuffle the shelf deterministically. Same seed, same order.",
    ),
) -> ProductPage:
    query = service.visible()
    if category:
        node = await db.scalar(select(Category).where(Category.slug == category))
        if node is None:
            raise HTTPException(status_code=404, detail="Category not found")
        query = query.where(Product.category_id.in_(await service.descendant_ids(db, node.id)))
    if kind is not None:
        query = query.where(Product.kind == kind)
    if q:
        query = query.where(service.text_match(q))

    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0

    # The shelf, shuffled — but shuffled the *same way* for every page of one
    # visit.
    #
    # `ORDER BY random()` would be a different order on every request, so page
    # two would re-roll the whole shelf: some pieces would arrive twice and
    # others would never be reachable at all. Hashing the id together with a
    # seed the caller keeps for the session gives a fixed but arbitrary order,
    # which is what "random" has to mean the moment there is paging.
    if seed is None:
        ordering = Product.created_at.desc()
    else:
        ordering = func.md5(func.concat(cast(Product.id, String), str(seed)))

    rows = await db.scalars(query.order_by(ordering).offset(paging.offset).limit(paging.size))
    products = list(rows.unique())
    left = await service.availability(db, [product.id for product in products])
    items = [service.to_card(product, lang, left.get(product.id, 0)) for product in products]
    return ProductPage(
        items=items,
        total=total,
        page=paging.page,
        size=paging.size,
        has_more=paging.offset + len(items) < total,
    )


@router.get("/products/{slug}", response_model=ProductDetail)
async def get_product(slug: str, db: DbSession, lang: Lang) -> ProductDetail:
    product = await get_or_404(
        db, Product, slug, field="slug", detail="Product not found", options=service.LOADED
    )
    if product.status is not ProductStatus.active:
        raise HTTPException(status_code=404, detail="Product not found")

    left = await service.availability(db, [product.id])
    per_variant = await service.variant_availability(db, product.id)
    # The whole batch, not only what is left: the page shows what was made and
    # strikes through what has gone. `kept` pieces are ours, never offered.
    pieces = list(
        await db.scalars(
            select(Piece)
            .where(Piece.product_id == product.id, Piece.state != PieceState.kept)
            .order_by(Piece.number)
        )
    )
    return service.to_detail(
        product,
        lang,
        available=left.get(product.id, 0),
        per_variant=per_variant,
        pieces=pieces,
    )


# ── Products, owner ───────────────────────────────────────────────────────────


async def _reembed() -> None:
    """Put the piece into meaning-space, after the response has gone.

    This was the missing caller. The feed's ranking function weights
    `cosine(visitor_vector, product_embedding)` at 0.8 — second only to a
    visitor's own affinity — but nothing in the application had ever written a
    product embedding. The column existed, the index existed, the term was in
    the SQL, and it was multiplied by zero for every piece in the shop. Half of
    what makes the store narrow around a visitor was switched off.

    It runs in the background because embedding calls an external model, and
    the owner pressing "publish" should not wait on it. It is idempotent and
    skips anything whose words have not changed, so calling it on every save
    costs one query and no money. It uses its own session — the request's is
    closed by the time this runs.
    """
    from app.db import SessionLocal

    try:
        async with SessionLocal() as db:
            result = await embeddings.refresh(db)
        if result.get("embedded"):
            logger.info("Embedded %s pieces", result["embedded"])
    except Exception as exc:
        # A piece that is not embedded is still for sale; it just ranks on
        # everything except meaning until the next save or backfill.
        logger.warning("Could not refresh embeddings: %s", exc)


async def _admin_view(db: DbSession, product: Product) -> ProductAdmin:
    left = await service.availability(db, [product.id])
    per_variant = await service.variant_availability(db, product.id)
    return service.to_admin(product, left.get(product.id, 0), per_variant)


@router.get("/admin/products", response_model=list[ProductAdmin])
async def list_products_admin(
    db: DbSession,
    owner: Owner,
    paging: Paging,
    status_filter: ProductStatus | None = Query(default=None, alias="status"),
    kind: ProductKind | None = Query(default=None),
) -> list[ProductAdmin]:
    query = service.with_relations(select(Product))
    if status_filter is not None:
        query = query.where(Product.status == status_filter)
    if kind is not None:
        query = query.where(Product.kind == kind)
    rows = await db.scalars(
        query.order_by(Product.created_at.desc()).offset(paging.offset).limit(paging.size)
    )
    products = list(rows.unique())
    left = await service.availability(db, [product.id for product in products])
    return [service.to_admin(product, left.get(product.id, 0), None) for product in products]


@router.post("/admin/products", response_model=ProductAdmin, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductWrite, db: DbSession, owner: Owner, background: BackgroundTasks
) -> ProductAdmin:
    if body.category_id:
        await get_or_404(db, Category, body.category_id, detail="Category not found")
    if body.status is ProductStatus.active:
        raise bad_request("Add at least one photo of the piece before publishing it")

    product = Product(
        **body.model_dump(),
        slug=await unique_slug(db, Product, body.title_en, fallback="piece"),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product, attribute_names=["media", "variants", "category"])
    background.add_task(_reembed)
    return await _admin_view(db, product)


@router.patch("/admin/products/{product_id}", response_model=ProductAdmin)
async def update_product(
    product_id: str, body: ProductPatch, db: DbSession, owner: Owner, background: BackgroundTasks
) -> ProductAdmin:
    product = await get_or_404(
        db, Product, product_id, detail="Product not found", options=service.LOADED
    )
    changes = body.model_dump(exclude_unset=True)

    if changes.get("status") is ProductStatus.active:
        # BRAND.md §8, the real-photo rule: the image is the actual piece.
        # Nothing can prove a file is genuine, but nothing goes on sale
        # without one.
        if not product.media:
            raise bad_request("Add at least one photo of the piece before publishing it")
        # A shelf piece with nothing on the shelf is not for sale. Publishing
        # it would be advertising something that does not exist.
        if product.kind is ProductKind.shelf:
            left = await service.availability(db, [product.id])
            if not left.get(product.id):
                raise bad_request("Add the pieces you made before publishing this")

    if "category_id" in changes and changes["category_id"]:
        await get_or_404(db, Category, changes["category_id"], detail="Category not found")
    if product.kind is ProductKind.workshop and changes.get("lead_time_days") is None:
        changes.pop("lead_time_days", None)

    for field, value in changes.items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product, attribute_names=["media", "variants", "category"])
    # Publishing, renaming or rewriting a piece all change what it means.
    background.add_task(_reembed)
    return await _admin_view(db, product)


@router.delete(
    "/admin/products/{product_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT
)
async def archive_product(product_id: str, db: DbSession, owner: Owner) -> None:
    """Archived, never deleted — order history has to stay reconstructable."""
    product = await get_or_404(db, Product, product_id, detail="Product not found")
    product.status = ProductStatus.archived
    await db.commit()


# ── Variants ──────────────────────────────────────────────────────────────────


@router.post(
    "/admin/products/{product_id}/variants",
    response_model=VariantOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_variant(
    product_id: str, body: VariantWrite, db: DbSession, owner: Owner
) -> VariantOut:
    product = await get_or_404(db, Product, product_id, detail="Product not found")
    if await db.scalar(select(ProductVariant.id).where(ProductVariant.sku == body.sku)):
        raise conflict(f"SKU '{body.sku}' is already used")

    variant = ProductVariant(product_id=product.id, **body.model_dump())
    db.add(variant)
    await db.commit()
    await db.refresh(variant)
    return VariantOut(
        id=variant.id,
        sku=variant.sku,
        option=variant.option_en,
        price=float(variant.price if variant.price is not None else product.price),
        available=0 if product.kind is ProductKind.shelf else None,
    )


@router.delete(
    "/admin/variants/{variant_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT
)
async def retire_variant(variant_id: str, db: DbSession, owner: Owner) -> None:
    """Deactivated rather than deleted: an order line may point at it."""
    variant = await get_or_404(db, ProductVariant, variant_id, detail="Variant not found")
    variant.is_active = False
    await db.commit()


# ── Pieces ────────────────────────────────────────────────────────────────────


@router.get("/admin/products/{product_id}/pieces", response_model=list[PieceAdmin])
async def list_pieces(product_id: str, db: DbSession, owner: Owner) -> list[PieceAdmin]:
    rows = await db.scalars(
        select(Piece).where(Piece.product_id == product_id).order_by(Piece.number)
    )
    return [
        PieceAdmin(
            id=piece.id,
            number=piece.number,
            batch_size=piece.batch_size,
            label=piece.label,
            state=piece.state.value,
            variant_id=piece.variant_id,
            made_on=piece.made_on,
            photo_url=piece.photo_url,
            note_en=piece.note_en,
            note_ar=piece.note_ar,
        )
        for piece in rows
    ]


@router.post(
    "/admin/products/{product_id}/pieces",
    response_model=list[PieceAdmin],
    status_code=status.HTTP_201_CREATED,
)
async def add_pieces(
    product_id: str, body: PieceBatchWrite, db: DbSession, owner: Owner
) -> list[PieceAdmin]:
    """You made twelve; twelve rows appear, numbered.

    One action, and afterwards the number on the page is a count of real
    objects rather than something typed into a stock field.
    """
    product = await get_or_404(db, Product, product_id, detail="Product not found")
    if product.kind is not ProductKind.shelf:
        raise bad_request("Made-to-order pieces have no shelf — they are made per order")
    if product.batch_closed:
        raise conflict("This batch is closed. Reopen it before adding more.")
    if body.variant_id:
        variant = await get_or_404(
            db, ProductVariant, body.variant_id, detail="Variant not found"
        )
        if variant.product_id != product_id:
            raise bad_request("That variant belongs to another piece")

    highest = await db.scalar(
        select(func.coalesce(func.max(Piece.number), 0)).where(Piece.product_id == product_id)
    )
    batch_size = highest + body.quantity

    # The batch grows, so the pieces already numbered are part of a larger run
    # than they were: 04/08 becomes 04/12. Saying "04 of 8" when twelve exist
    # would be the invented scarcity BRAND.md §10 rules out.
    await db.execute(
        Piece.__table__.update()
        .where(Piece.product_id == product_id)
        .values(batch_size=batch_size)
    )

    created = [
        Piece(
            product_id=product_id,
            variant_id=body.variant_id,
            number=highest + offset,
            batch_size=batch_size,
            made_on=body.made_on or product.made_on,
            note_en=body.note_en,
            note_ar=body.note_ar,
        )
        for offset in range(1, body.quantity + 1)
    ]
    db.add_all(created)
    await db.commit()

    # Everyone who asked to be told is told, without anyone having to remember.
    await alerts.announce(db, product)

    return [
        PieceAdmin(
            id=piece.id,
            number=piece.number,
            batch_size=piece.batch_size,
            label=piece.label,
            state=piece.state.value,
            variant_id=piece.variant_id,
            made_on=piece.made_on,
            photo_url=piece.photo_url,
            note_en=piece.note_en,
            note_ar=piece.note_ar,
        )
        for piece in created
    ]


@router.delete("/admin/pieces/{piece_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def remove_piece(piece_id: str, db: DbSession, owner: Owner) -> None:
    """Only a piece nobody has bought. A sold piece is part of an order."""
    piece = await get_or_404(db, Piece, piece_id, detail="Piece not found")
    if piece.state is not PieceState.available:
        raise conflict(f"That piece is {piece.state.value} — it cannot be removed")

    product_id = piece.product_id
    await db.delete(piece)
    await db.flush()

    # The run got smaller, so say so. Adding pieces already rewrites every
    # sibling's `batch_size` for exactly this reason — 04/08 becomes 04/12 when
    # the batch grows — and taking one away has to do the same in reverse.
    # Without this the shop keeps announcing "01 of 4" over three objects,
    # which is the invented scarcity BRAND.md §10 rules out, pointing the other
    # way. The highest surviving number is the size of the run: correcting a
    # miscount at the end heals the labels, and removing from the middle leaves
    # the numbers people were already shown alone.
    remaining = await db.scalar(
        select(func.coalesce(func.max(Piece.number), 0)).where(Piece.product_id == product_id)
    )
    await db.execute(
        Piece.__table__.update()
        .where(Piece.product_id == product_id)
        .values(batch_size=remaining)
    )
    await db.commit()


# ── Waiting on a piece ────────────────────────────────────────────────────────


@router.post("/products/{slug}/alert", status_code=status.HTTP_202_ACCEPTED)
async def wait_for_more(
    slug: str, body: AlertRequest, db: DbSession, lang: Lang, _: RequestLimit
) -> dict:
    """"Tell me when you make another."

    A sold-out page is otherwise a dead end, and a dead end is a visitor we
    paid to attract and then sent away. No account, one field.
    """
    product = await get_or_404(db, Product, slug, field="slug", detail="Product not found")
    if product.status is not ProductStatus.active:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.kind is not ProductKind.shelf:
        raise bad_request("This one is made to order — you can ask for it any time")

    await alerts.add(db, product=product, phone=body.phone, email=body.email, lang=lang)
    return {"waiting": True}


@router.get("/admin/products/{product_id}/waiting")
async def who_is_waiting(product_id: str, db: DbSession, owner: Owner) -> dict:
    """How many people want this one back.

    The sharpest answer to "what should I make next" the workshop gets: unlike
    a search, it is attached to a real piece at a price they already saw.
    """
    return {"waiting": await alerts.waiting_for(db, product_id)}


# ── Photography ───────────────────────────────────────────────────────────────


@router.post(
    "/admin/products/{product_id}/media",
    response_model=MediaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_product_photo(
    product_id: str,
    file: UploadFile,
    db: DbSession,
    owner: Owner,
    alt_en: str = "",
    alt_ar: str = "",
    is_process_footage: bool = False,
) -> MediaResponse:
    product = await get_or_404(
        db, Product, product_id, detail="Product not found", options=(selectinload(Product.media),)
    )
    # Read first, then decide what it is from its own bytes. The declared
    # Content-Type is whatever the client typed and is never used.
    data = await file.read()
    if not data:
        raise bad_request("That file is empty")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="That photo is larger than 12 MB")

    content_type = sniff_image(data)
    if content_type is None:
        raise HTTPException(status_code=415, detail="Photos must be JPEG, PNG or WebP")

    url = await upload_image(data, content_type, prefix=f"products/{product_id}")
    media = ProductMedia(
        product_id=product_id,
        url=url,
        alt_en=alt_en,
        alt_ar=alt_ar,
        is_process_footage=is_process_footage,
        is_primary=not product.media,
        sort_order=len(product.media),
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return service.media_out(media, "en")


@router.post("/admin/media/{media_id}/primary", response_model=MediaResponse)
async def set_primary_photo(media_id: str, db: DbSession, owner: Owner) -> MediaResponse:
    media = await get_or_404(db, ProductMedia, media_id, detail="Photo not found")
    siblings = await db.scalars(
        select(ProductMedia).where(ProductMedia.product_id == media.product_id)
    )
    for sibling in siblings:
        sibling.is_primary = sibling.id == media_id
    await db.commit()
    await db.refresh(media)
    return service.media_out(media, "en")


@router.delete("/admin/media/{media_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(media_id: str, db: DbSession, owner: Owner) -> None:
    media = await get_or_404(db, ProductMedia, media_id, detail="Photo not found")
    product = await get_or_404(
        db,
        Product,
        media.product_id,
        detail="Product not found",
        options=(selectinload(Product.media),),
    )
    if product.status is ProductStatus.active and len(product.media) == 1:
        raise bad_request("A published piece must keep at least one photo")

    was_primary = media.is_primary
    url = media.url
    await db.delete(media)
    await db.flush()
    if was_primary:
        remaining = await db.scalar(
            select(ProductMedia)
            .where(ProductMedia.product_id == product.id)
            .order_by(ProductMedia.sort_order)
        )
        if remaining is not None:
            remaining.is_primary = True
    await db.commit()
    await delete_object(url)


@router.get("/workshop")
async def workshop_numbers(db: DbSession) -> dict:
    """What the workshop has actually made.

    Real counts, straight from the pieces table. This is the most
    characteristic thing we can say and the one thing a reseller cannot say at
    all: they do not know how many of anything exists, because they did not
    make it.
    """
    made = await db.scalar(select(func.count()).select_from(Piece)) or 0
    here = (
        await db.scalar(
            select(func.count()).select_from(Piece).where(Piece.state == PieceState.available)
        )
        or 0
    )
    kinds = (
        await db.execute(
            select(Product.kind, func.count())
            .where(Product.status == ProductStatus.active)
            .group_by(Product.kind)
        )
    ).all()
    latest = await db.scalar(select(func.max(Piece.made_on)))
    counts = {kind.value if hasattr(kind, "value") else str(kind): n for kind, n in kinds}
    return {
        "pieces_made": made,
        "pieces_here": here,
        "on_the_shelf": counts.get("shelf", 0),
        "made_to_order": counts.get("workshop", 0),
        "last_made_on": latest.isoformat() if latest else None,
    }
