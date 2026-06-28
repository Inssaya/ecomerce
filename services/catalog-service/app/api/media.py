from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Product, ProductMedia
from app.schemas import ProductMediaResponse
from app.storage import upload_bytes

router = APIRouter(prefix="/products/{product_id}/media", tags=["media"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("", response_model=ProductMediaResponse, status_code=status.HTTP_201_CREATED)
async def upload_product_media(
    product_id: str,
    file: UploadFile,
    is_primary: bool = False,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id or x_user_role not in ("seller", "admin"):
        raise HTTPException(status_code=403, detail="Seller or admin required")

    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.seller_id != x_user_id and x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Not your product")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {content_type}")

    data = await file.read()
    if len(data) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    url = await upload_bytes(data, content_type, prefix=f"products/{product_id}")

    if is_primary:
        # Unset any existing primary
        existing = await db.execute(
            select(ProductMedia)
            .where(ProductMedia.product_id == product_id, ProductMedia.is_primary.is_(True))
        )
        for m in existing.scalars().all():
            m.is_primary = False

    sort_result = await db.execute(
        select(ProductMedia).where(ProductMedia.product_id == product_id)
    )
    sort_order = len(sort_result.scalars().all())

    media = ProductMedia(
        product_id=product_id,
        url=url,
        is_primary=is_primary or sort_order == 0,
        sort_order=sort_order,
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return media


@router.patch("/{media_id}", response_model=ProductMediaResponse)
async def set_primary_media(
    product_id: str,
    media_id: str,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id or x_user_role not in ("seller", "admin"):
        raise HTTPException(status_code=403, detail="Seller or admin required")

    result = await db.execute(
        select(ProductMedia).where(ProductMedia.id == media_id, ProductMedia.product_id == product_id)
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Unset existing primary
    existing = await db.execute(
        select(ProductMedia).where(ProductMedia.product_id == product_id, ProductMedia.is_primary.is_(True))
    )
    for m in existing.scalars().all():
        m.is_primary = False

    media.is_primary = True
    await db.commit()
    await db.refresh(media)
    return media


@router.delete("/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(
    product_id: str,
    media_id: str,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id or x_user_role not in ("seller", "admin"):
        raise HTTPException(status_code=403, detail="Seller or admin required")

    result = await db.execute(
        select(ProductMedia).where(ProductMedia.id == media_id, ProductMedia.product_id == product_id)
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    await db.delete(media)
    await db.commit()
