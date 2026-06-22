from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slugify import slugify

from app.database import get_db
from app.models import Label, LabelGroup
from app.schemas import LabelCreate, LabelResponse

router = APIRouter(prefix="/labels", tags=["labels"])


@router.get("", response_model=list[LabelResponse])
async def list_labels(
    group: LabelGroup | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Label).where(Label.is_active.is_(True)).order_by(Label.group, Label.name)
    if group:
        query = query.where(Label.group == group)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/groups", tags=["labels"])
async def list_groups():
    return [g.value for g in LabelGroup]


@router.post("", response_model=LabelResponse, status_code=status.HTTP_201_CREATED)
async def create_label(body: LabelCreate, db: AsyncSession = Depends(get_db)):
    slug = slugify(f"{body.group.value}-{body.name}")
    existing = await db.execute(select(Label).where(Label.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Label already exists")

    label = Label(group=body.group, name=body.name, slug=slug)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return label


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(label_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Label).where(Label.id == label_id))
    label = result.scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    label.is_active = False
    await db.commit()
