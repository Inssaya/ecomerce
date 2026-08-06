"""Public reads for the pages that bring people in."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.deps import DbSession, Lang
from app.models.local import City, Service
from app.modules.local import service as local

router = APIRouter(tags=["local"])


def _city(place: City, lang: str, stats: dict | None = None) -> dict:
    return {
        "slug": place.slug,
        "name": place.name_ar if lang == "ar" else place.name_en,
        "name_en": place.name_en,
        "region": place.region_ar if lang == "ar" else place.region_en,
        "delivery_days": [place.delivery_days_min, place.delivery_days_max],
        "delivery_fee": local.fee_for(place),
        "free_delivery_over": settings.free_delivery_over,
        **({"history": stats} if stats is not None else {}),
    }


def _service(item: Service, lang: str, *, full: bool = False) -> dict:
    ar = lang == "ar"
    out = {
        "slug": item.slug,
        "name": item.name_ar if ar else item.name_en,
        "summary": item.summary_ar if ar else item.summary_en,
        "from_price": float(item.from_price) if item.from_price is not None else None,
        "lead_time_days": item.lead_time_days,
        "category_slug": item.category_slug,
    }
    if full:
        out["body"] = item.body_ar if ar else item.body_en
    return out


@router.get("/places")
async def list_places(db: DbSession, lang: Lang) -> dict:
    return {"items": [_city(place, lang) for place in await local.cities(db)]}


@router.get("/places/{slug}")
async def get_place(slug: str, db: DbSession, lang: Lang) -> dict:
    place = await local.city(db, slug)
    if place is None:
        raise HTTPException(status_code=404, detail="We don't deliver there yet")
    return {
        **_city(place, lang, await local.delivered_to(db, place.name_en)),
        # Every city page lists what can be made, because someone who searched
        # for a city needs to be told what they can get, and someone who
        # searched for a service needs the delivery promise. The two pages are
        # each other's other half.
        "services": [_service(item, lang) for item in await local.services(db)],
    }


@router.get("/services")
async def list_services(db: DbSession, lang: Lang) -> dict:
    return {"items": [_service(item, lang) for item in await local.services(db)]}


@router.get("/services/{slug}")
async def get_service(slug: str, db: DbSession, lang: Lang) -> dict:
    item = await local.service(db, slug)
    if item is None:
        raise HTTPException(status_code=404, detail="We don't do that one")
    return {
        **_service(item, lang, full=True),
        "places": [_city(place, lang) for place in await local.cities(db)],
    }
