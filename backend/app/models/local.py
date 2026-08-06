"""Where we deliver, and what we make.

These two tables exist for one reason: somebody in Marrakesh types *laser
cutting Marrakesh* into a phone, and today this shop has no page that answers
that. The shelf and the request form are both real answers, but neither says
the words, and a page that does not say what it does cannot be found by
someone looking for it.

**The line this must not cross.** Generating a page for every service in every
city is the oldest trick in local search and Google has demoted it by name for
a decade — they are called doorway pages, and the tell is that the pages differ
only by a swapped noun. So both tables carry content that is actually
different per row: a city has its own delivery window and its own count of
pieces actually sent there, a service has its own written description, its own
starting price and its own lead time. Where there is nothing true to say, the
page says less rather than inventing more.
"""
from __future__ import annotations

from sqlalchemy import Boolean, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.base import TimestampMixin, uuid_pk


class City(Base, TimestampMixin):
    """A Moroccan city we deliver to.

    Not a lookup table for addresses — checkout takes a free-text city,
    because a dropdown that does not contain someone's town loses the order.
    This is the list we are willing to make a public promise about.
    """

    __tablename__ = "cities"

    id: Mapped[str] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name_en: Mapped[str] = mapped_column(String(120), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(120), nullable=False)
    #: Roughly where it is, in words a person uses rather than an admin region
    #: code: "on the coast", "in the north". Used in the page's own sentences.
    region_en: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    region_ar: Mapped[str] = mapped_column(String(120), default="", nullable=False)

    #: The delivery window we are prepared to put in writing. Two numbers, not
    #: one, because a single number is a promise and a range is the truth.
    delivery_days_min: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    delivery_days_max: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    #: Overrides the flat fee where a city genuinely costs more to reach.
    #: Null means the shop-wide fee applies.
    delivery_fee: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    #: Bigger cities get sorted first, and the number is honest about why.
    people: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Service(Base, TimestampMixin):
    """Something the workshop does, as opposed to something it has made.

    A category answers *what is this piece*. A service answers *can you make me
    one of these*, which is a different question and a different search. The
    two are linked — a service points at the category its examples come from —
    but they are not the same row, because "printing on demand" is not a shelf
    of products, it is a thing the workshop will do for you.
    """

    __tablename__ = "services"

    id: Mapped[str] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(160), nullable=False)
    #: One sentence, the one that goes under the title and into the search
    #: result. Written, not generated.
    summary_en: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    summary_ar: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    #: The real page: what it is, how it is done, what it suits. Long enough to
    #: be worth reading, which is also the only kind of page that ranks.
    body_en: Mapped[str] = mapped_column(Text, default="", nullable=False)
    body_ar: Mapped[str] = mapped_column(Text, default="", nullable=False)

    #: "From X" — an honest floor, not a quote. Null means it depends enough
    #: that a number would mislead.
    from_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    #: Where the examples come from, if this service has a shelf behind it.
    category_slug: Mapped[str | None] = mapped_column(String(160), nullable=True)

    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
