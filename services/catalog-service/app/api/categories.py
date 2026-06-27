from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slugify import slugify

from app.database import get_db
from app.models import Category
from app.schemas import CategoryCreate, CategoryResponse, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    store_id: str | None = None,
    parent_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Category).where(Category.is_active.is_(True))
    if store_id:
        query = query.where(Category.store_id == store_id)
    if parent_id is not None:
        query = query.where(Category.parent_id == parent_id)
    else:
        query = query.where(Category.parent_id.is_(None))
    query = query.order_by(Category.display_order)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/tree", response_model=list[CategoryResponse])
async def category_tree(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category)
        .where(Category.parent_id.is_(None), Category.is_active.is_(True))
        .order_by(Category.display_order)
    )
    return result.scalars().all()


@router.get("/{slug}", response_model=CategoryResponse)
async def get_category(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.slug == slug))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return cat


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    slug = slugify(body.name)
    existing = await db.execute(select(Category).where(Category.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{__import__('uuid').uuid4().hex[:6]}"

    cat = Category(
        name=body.name,
        slug=slug,
        parent_id=body.parent_id,
        icon=body.icon,
        display_order=body.display_order,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return cat


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str, body: CategoryUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.commit()
    await db.refresh(cat)
    return cat
