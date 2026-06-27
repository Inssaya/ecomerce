import math

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Label, Product, ProductLabel, ProductStatus
from app.schemas import ProductCreate, ProductListResponse, ProductResponse, ProductUpdate, SearchResponse
from app.search import delete_product, index_product, product_to_doc, search

router = APIRouter(prefix="/products", tags=["products"])


def _require_admin(x_user_role: str | None):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("", response_model=ProductListResponse)
async def list_products(
    store_id: str | None = None,
    category_id: str | None = None,
    label_ids: list[str] = Query(default=[]),
    seller_id: str | None = None,
    status_filter: ProductStatus = Query(default=ProductStatus.active, alias="status"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="created_at"),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Product)
        .options(
            selectinload(Product.labels),
            selectinload(Product.media),
            selectinload(Product.category),
        )
        .where(Product.status == status_filter)
    )
    if store_id:
        query = query.where(Product.store_id == store_id)
    if category_id:
        query = query.where(Product.category_id == category_id)
    if seller_id:
        query = query.where(Product.seller_id == seller_id)
    if label_ids:
        query = query.join(ProductLabel).where(ProductLabel.label_id.in_(label_ids))

    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar_one()

    sort_col = getattr(Product, sort_by, Product.created_at)
    query = query.order_by(sort_col.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    items = result.scalars().unique().all()

    return ProductListResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 0,
    )


@router.get("/search", response_model=SearchResponse)
async def search_products(
    q: str = "",
    store_id: str | None = None,
    category_id: str | None = None,
    label_ids: list[str] = Query(default=[]),
    min_price: float | None = None,
    max_price: float | None = None,
    sort_by: str | None = None,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
):
    filter_parts = ['status = "active"']
    if store_id:
        filter_parts.append(f'store_id = "{store_id}"')
    if category_id:
        filter_parts.append(f'category_id = "{category_id}"')
    if label_ids:
        label_filter = " OR ".join(f'label_ids = "{lid}"' for lid in label_ids)
        filter_parts.append(f"({label_filter})")
    if min_price is not None:
        filter_parts.append(f"price >= {min_price}")
    if max_price is not None:
        filter_parts.append(f"price <= {max_price}")

    filters = " AND ".join(filter_parts) if filter_parts else None
    sort = [f"{sort_by}:asc"] if sort_by else None

    result = await search(
        q, filters=filters, sort=sort, limit=size, offset=(page - 1) * size
    )
    return SearchResponse(**result)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.labels),
            selectinload(Product.media),
            selectinload(Product.category),
        )
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    body: ProductCreate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)

    product = Product(
        seller_id=x_user_id or "admin",
        store_id=body.store_id,
        title=body.title,
        description=body.description,
        price=body.price,
        currency=body.currency,
        stock=body.stock,
        category_id=body.category_id,
        status=body.status,
    )
    db.add(product)
    await db.flush()

    if body.label_ids:
        labels_result = await db.execute(select(Label).where(Label.id.in_(body.label_ids)))
        product.labels = list(labels_result.scalars().all())

    await db.commit()
    await db.refresh(product)

    result = await db.execute(
        select(Product)
        .options(
            selectinload(Product.labels),
            selectinload(Product.media),
            selectinload(Product.category),
        )
        .where(Product.id == product.id)
    )
    product = result.scalar_one()
    await index_product(product_to_doc(product))
    return product


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)

    result = await db.execute(
        select(Product)
        .options(selectinload(Product.labels), selectinload(Product.media), selectinload(Product.category))
        .where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    for field, value in body.model_dump(exclude_none=True, exclude={"label_ids"}).items():
        setattr(product, field, value)

    if body.label_ids is not None:
        labels_result = await db.execute(select(Label).where(Label.id.in_(body.label_ids)))
        product.labels = list(labels_result.scalars().all())

    await db.commit()
    await db.refresh(product)
    await index_product(product_to_doc(product))
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_route(
    product_id: str,
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.status = ProductStatus.deleted
    await db.commit()
    await delete_product(product_id)
