from fastapi import APIRouter, Depends, Header, HTTPException, status
from slugify import slugify
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Store
from app.schemas import StoreCreate, StoreResponse, StoreUpdate

router = APIRouter(prefix="/stores", tags=["stores"])


def _require_admin(x_user_role: str | None):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("", response_model=list[StoreResponse])
async def list_stores(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Store).where(Store.is_active.is_(True)).order_by(Store.display_order)
    )
    return result.scalars().all()


@router.get("/all", response_model=list[StoreResponse])
async def list_all_stores(
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    result = await db.execute(select(Store).order_by(Store.display_order))
    return result.scalars().all()


@router.get("/{slug}", response_model=StoreResponse)
async def get_store(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Store).where(Store.slug == slug))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.post("", response_model=StoreResponse, status_code=status.HTTP_201_CREATED)
async def create_store(
    body: StoreCreate,
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    slug = slugify(body.slug or body.name)
    existing = await db.execute(select(Store).where(Store.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Store slug already exists")

    store = Store(
        slug=slug,
        name=body.name,
        description=body.description,
        theme_color=body.theme_color,
        accent_color=body.accent_color,
        hero_tagline=body.hero_tagline,
        whatsapp_number=body.whatsapp_number,
        icon=body.icon,
        display_order=body.display_order,
    )
    db.add(store)
    await db.commit()
    await db.refresh(store)
    return store


@router.put("/{store_id}", response_model=StoreResponse)
async def update_store(
    store_id: str,
    body: StoreUpdate,
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(store, field, value)
    await db.commit()
    await db.refresh(store)
    return store


@router.delete("/{store_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_store(
    store_id: str,
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(x_user_role)
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    store.is_active = False
    await db.commit()
