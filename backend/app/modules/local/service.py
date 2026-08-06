"""Reading the cities and services, with what is actually true attached.

The whole value of a city page over a generic one is that it can say something
only this shop knows: how many pieces have gone to that city, and how long they
really took. That is why these functions join orders rather than just reading
the seeded rows — and why every count below is guarded, because a new shop has
none of it and a page that says "0 pieces delivered" is worse than a page that
does not raise the subject.
"""
from __future__ import annotations

from sqlalchemy import Float, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Order, OrderStatus
from app.models.local import City, Service

#: Below this, the number is not evidence, it is an anecdote — and printing it
#: on a public page invites the reader to notice how small the shop is.
ENOUGH_TO_MENTION = 3


async def cities(db: AsyncSession) -> list[City]:
    return list(
        await db.scalars(
            select(City).where(City.is_active.is_(True)).order_by(City.people.desc())
        )
    )


async def city(db: AsyncSession, slug: str) -> City | None:
    return await db.scalar(select(City).where(City.slug == slug, City.is_active.is_(True)))


async def services(db: AsyncSession) -> list[Service]:
    return list(
        await db.scalars(
            select(Service)
            .where(Service.is_active.is_(True))
            .order_by(Service.display_order, Service.name_en)
        )
    )


async def service(db: AsyncSession, slug: str) -> Service | None:
    return await db.scalar(
        select(Service).where(Service.slug == slug, Service.is_active.is_(True))
    )


async def delivered_to(db: AsyncSession, name: str) -> dict:
    """What we have actually sent to one city.

    Matched case-insensitively on the free-text city from checkout, because
    that field is typed by a person and "casablanca", "Casablanca" and
    "CASABLANCA " are one place.
    """
    row = (
        await db.execute(
            select(
                func.count().label("delivered"),
                func.avg(
                    cast(
                        func.extract("epoch", Order.updated_at - Order.created_at) / 86400.0,
                        Float,
                    )
                ).label("avg_days"),
            ).where(
                func.lower(func.trim(Order.city)) == name.lower(),
                Order.status == OrderStatus.delivered,
            )
        )
    ).one()

    delivered = row.delivered or 0
    return {
        "delivered": delivered,
        # Only said out loud once there is enough of it to be a fact.
        "worth_saying": delivered >= ENOUGH_TO_MENTION,
        "average_days": round(float(row.avg_days), 1) if row.avg_days and delivered else None,
    }


def fee_for(place: City) -> float:
    """What delivery costs there — the city's own price, or the shop's."""
    return float(place.delivery_fee) if place.delivery_fee is not None else settings.delivery_fee
