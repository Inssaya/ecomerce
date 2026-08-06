"""The catalogue — public reads, owner writes.

Ported from catalog-service. Gone in the move: the Store model and its four
subdomain storefronts, the Meilisearch index and its sync calls, and every
`seller_id` ownership check (there is one workshop).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import bad_request, get_or_404
from app.core.slug import unique_slug
from app.core.storage import ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, delete_object, upload_image
from app.deps import DbSession, Lang, Owner, Paging
from app.models import Category, Product, ProductMedia, ProductStatus
from app.modules.catalog import service
from app.modules.catalog.schemas import (
    CategoryAdmin,
    CategoryNode,
    CategoryWrite,
    MediaResponse,
    ProductAdmin,
    ProductDetail,
    ProductPage,
    ProductPatch,
    ProductWrite,
)

router = APIRouter(tags=["catalog"])


# ── Categories ────────────────────────────────────────────────────────────────


@router.get("/categories", response_model=list[CategoryNode])
async def category_tree(db: DbSession, lang: Lang) -> list[CategoryNode]:
    rows = await db.scalars(
        select(Category).where(Category.is_active.is_(True)).order_by(Category.display_order)
    )
    return service.build_tree(list(rows), lang)


@router.post(
    "/admin/categories", response_model=CategoryAdmin, status_code=status.HTTP_201_CREATED
)
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


@router.get("/admin/categories", response_model=list[CategoryAdmin])
async def list_categories_admin(db: DbSession, owner: Owner) -> list[Category]:
    rows = await db.scalars(select(Category).order_by(Category.display_order))
    return list(rows)


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
    q: str | None = Query(default=None, min_length=1, max_length=120),
) -> ProductPage:
    query = service.visible()
    if category:
        node = await db.scalar(select(Category).where(Category.slug == category))
        if node is None:
            raise HTTPException(status_code=404, detail="Category not found")
        query = query.where(Product.category_id.in_(await _descendant_ids(db, node.id)))
    if q:
        query = query.where(service.text_match(q))

    total = await db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = await db.scalars(
        query.order_by(Product.created_at.desc()).offset(paging.offset).limit(paging.size)
    )
    items = [service.to_card(product, lang) for product in rows.unique()]
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
        db,
        Product,
        slug,
        field="slug",
        detail="Product not found",
        options=(selectinload(Product.media), selectinload(Product.category)),
    )
    if product.status is not ProductStatus.active:
        raise HTTPException(status_code=404, detail="Product not found")
    return service.to_detail(product, lang)


async def _descendant_ids(db: AsyncSession, root_id: str) -> list[str]:
    """A category page shows everything beneath it: choosing T-Shirts shows
    Oversize and Slim too."""
    pairs = (await db.execute(select(Category.id, Category.parent_id))).all()
    children: dict[str, list[str]] = {}
    for child_id, parent_id in pairs:
        children.setdefault(parent_id, []).append(child_id)

    collected = [root_id]
    frontier = [root_id]
    while frontier:
        current = frontier.pop()
        for child in children.get(current, []):
            collected.append(child)
            frontier.append(child)
    return collected


# ── Products, owner ───────────────────────────────────────────────────────────


@router.get("/admin/products", response_model=list[ProductAdmin])
async def list_products_admin(
    db: DbSession,
    owner: Owner,
    paging: Paging,
    status_filter: ProductStatus | None = Query(default=None, alias="status"),
) -> list[ProductAdmin]:
    query = service.with_media(select(Product))
    if status_filter is not None:
        query = query.where(Product.status == status_filter)
    rows = await db.scalars(
        query.order_by(Product.created_at.desc()).offset(paging.offset).limit(paging.size)
    )
    return [service.to_admin(product) for product in rows.unique()]


@router.post("/admin/products", response_model=ProductAdmin, status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductWrite, db: DbSession, owner: Owner) -> ProductAdmin:
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
    await db.refresh(product, attribute_names=["media"])
    return service.to_admin(product)


@router.patch("/admin/products/{product_id}", response_model=ProductAdmin)
async def update_product(
    product_id: str, body: ProductPatch, db: DbSession, owner: Owner
) -> ProductAdmin:
    product = await get_or_404(
        db, Product, product_id, detail="Product not found", options=(selectinload(Product.media),)
    )
    changes = body.model_dump(exclude_unset=True)

    # BRAND.md §8, the real-photo rule: the image on the page is the actual
    # piece. Nothing can prove a file is genuine, but a product with no
    # photograph of its own cannot go on sale.
    if changes.get("status") is ProductStatus.active and not product.media:
        raise bad_request("Add at least one photo of the piece before publishing it")
    if "category_id" in changes and changes["category_id"]:
        await get_or_404(db, Category, changes["category_id"], detail="Category not found")

    for field, value in changes.items():
        setattr(product, field, value)
    await db.commit()
    await db.refresh(product, attribute_names=["media"])
    return service.to_admin(product)


@router.delete("/admin/products/{product_id}", response_model=None, status_code=status.HTTP_204_NO_CONTENT)
async def archive_product(product_id: str, db: DbSession, owner: Owner) -> None:
    """Archived, never deleted — order history has to stay reconstructable."""
    product = await get_or_404(db, Product, product_id, detail="Product not found")
    product.status = ProductStatus.archived
    await db.commit()


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
) -> MediaResponse:
    product = await get_or_404(
        db, Product, product_id, detail="Product not found", options=(selectinload(Product.media),)
    )
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Photos must be JPEG, PNG or WebP")

    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="That photo is larger than 12 MB")
    if not data:
        raise bad_request("That file is empty")

    url = await upload_image(data, content_type, prefix=f"products/{product_id}")
    media = ProductMedia(
        product_id=product_id,
        url=url,
        alt_en=alt_en,
        alt_ar=alt_ar,
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
