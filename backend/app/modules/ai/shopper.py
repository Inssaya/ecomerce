"""The shopping concierge — the buyer-facing assistant.

BRAND.md §6 is the reason this exists, and it is not novelty. In a
cash-on-delivery market 15–30% of packages are refused at the door, always for
the same reason: the box surprised the customer. Every question answered
*before* the purchase is a refusal that never happens. So the assistant's job is
less "sell" than "make sure nobody is surprised" — exact sizes, real photos,
honest dates, and a plain "we don't have that, but we could make it".

Two kinds of tool. Most read the database here. A few are things only the
browser can do — the cart lives in the visitor's phone, not on the server — and
those come back as `_actions` for the client to carry out.

There is deliberately **no tool that places an order.** The plan allowed one;
an assistant that commits someone to a cash payment at their door, from a chat,
is a refused package waiting to happen. It fills the cart and hands over to the
checkout screen, where the total and the address are visible and confirmed by a
human. That is what "confirm the order out loud before placing it" should mean.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.agent import Toolbox, dispatch, spec
from app.models import Order, Product, ProductStatus, SignalType
from app.models.requests import CustomRequest
from app.modules.catalog import service as catalog
from app.modules.feed import engine
from app.modules.feed import service as signals
from app.modules.requests.schemas import RequestCreate
from app.modules.requests.service import raise_request

# Frozen constant — see the caching note in `core/agent`. Nothing that varies
# per request may appear here.
SYSTEM_PROMPT = """You are the assistant of MoStyle, a small Moroccan workshop. We do not resell anything: we make our pieces ourselves — 3D printed, machined, finished by hand. Two ways to buy: The Shelf (pieces we have already made, a real photo of the actual piece, and only as many as we made) and The Workshop (you describe it, we make it).

YOUR JOB:
Stop people being surprised by the box. Everything is paid in cash at the door, so a wrong expectation costs us a refused delivery and costs them their time. Answer the question fully before encouraging any purchase.

HARD RULES:
- Every fact you state — a price, a size, how many are left, a date — must come from a tool result in this conversation. Never estimate and never invent. If the tools do not have it, say plainly that you will find out.
- Prices are in dirhams (MAD). Payment is cash on delivery, in Morocco, always.
- Availability is real. "Three left" means we made three. Never invent urgency, never rush anyone, never mention a countdown.
- If nothing we have matches what they want, use request_custom_item. This is the best outcome we have short of a sale — say plainly "we don't have that, but we can make it", and ask for the detail you need first.
- Call every tool you need for the question in ONE round; they run together. Never call the same tool twice with the same arguments.
- add_to_cart only after they have chosen. Then tell them it is in the cart and that they can check out when ready. You cannot place the order yourself, and you should not try: they confirm it themselves on the checkout screen.
- Answer in the language of the question. English or Arabic only, never any other language.

VOICE:
Soft, warm, certain. Short sentences, plain words. We are quietly confident because we made the thing. Never "premium", never "luxury", never exclamation marks, never emoji. Concede what is true: custom work is slower, because it is being made."""


def _card(product: Product, available: int | None, lang: str) -> dict[str, Any]:
    """What the model needs to talk about a piece, and nothing more."""
    return {
        "id": product.id,
        "slug": product.slug,
        "title": product.title(lang),
        "price_mad": float(product.price),
        "price_max_mad": float(product.price_max) if product.price_max is not None else None,
        "kind": product.kind.value,
        "available": available if product.is_shelf else None,
        "ready_in_days": None if product.is_shelf else product.lead_time_days,
        "category": product.category.name(lang) if product.category else None,
    }


def build(db: AsyncSession, *, lang: str, visitor_id: str | None) -> Toolbox:
    """One toolbox bound to one visitor's request."""

    async def search_products(query: str = "", kind: str | None = None, limit: int = 6) -> dict:
        statement = catalog.visible()
        if query:
            statement = statement.where(catalog.text_match(query))
        if kind in ("shelf", "workshop"):
            statement = statement.where(Product.kind == kind)
        products = list(
            (await db.scalars(statement.limit(min(limit, 10)))).unique()
        )
        left = await catalog.availability(db, [product.id for product in products])
        if query and visitor_id:
            # An explicit search is the strongest statement of intent there is,
            # and the most direct answer to "what are people asking us for that
            # we do not make".
            await signals.record(
                db,
                visitor_id=visitor_id,
                user_id=None,
                signal_type=SignalType.search,
                query=query,
            )
            await db.commit()
        return {
            "found": len(products),
            "products": [_card(product, left.get(product.id, 0), lang) for product in products],
        }

    async def get_product(slug: str) -> dict:
        product = await db.scalar(
            catalog.with_relations(select(Product)).where(Product.slug == slug)
        )
        if product is None or product.status is not ProductStatus.active:
            return {"error": f"No piece with the slug '{slug}'"}
        left = await catalog.availability(db, [product.id])
        per_variant = await catalog.variant_availability(db, product.id)
        return {
            **_card(product, left.get(product.id, 0), lang),
            "description": product.description(lang),
            "how_it_was_made": product.story(lang),
            "photos": len(product.media),
            "options": [
                {
                    "id": variant.id,
                    "option": variant.option(lang),
                    "price_mad": variant.unit_price(),
                    "available": per_variant.get(variant.id, 0) if product.is_shelf else None,
                }
                for variant in product.variants
                if variant.is_active
            ],
        }

    async def get_recommendations(limit: int = 6) -> dict:
        products, _, _ = await engine.page(
            db, visitor_id=visitor_id or "anonymous", size=min(limit, 10), offset=0
        )
        left = await catalog.availability(db, [product.id for product in products])
        return {
            "products": [_card(product, left.get(product.id, 0), lang) for product in products]
        }

    async def add_to_cart(product_id: str, quantity: int = 1, variant_id: str | None = None) -> dict:
        """Validated here, carried out by the browser — the cart is on their
        phone, not on our server."""
        product = await db.scalar(
            catalog.with_relations(select(Product)).where(Product.id == product_id)
        )
        if product is None or product.status is not ProductStatus.active:
            return {"error": "That piece is not available"}
        if product.is_shelf:
            left = (await catalog.availability(db, [product.id])).get(product.id, 0)
            if left < quantity:
                return {
                    "error": f"We only have {left} of '{product.title(lang)}' — we made that many"
                }
        return {
            "added": product.title(lang),
            "quantity": quantity,
            "_actions": [
                {
                    "type": "add_to_cart",
                    "product_id": product.id,
                    "slug": product.slug,
                    "variant_id": variant_id,
                    "quantity": quantity,
                }
            ],
        }

    async def open_product(slug: str) -> dict:
        return {"opened": slug, "_actions": [{"type": "open_product", "slug": slug}]}

    async def go_to_checkout() -> dict:
        """Hand over to the checkout screen. The customer confirms the total
        and the address themselves — we never commit them to a cash payment."""
        return {"ok": True, "_actions": [{"type": "go_to_checkout"}]}

    async def request_custom_item(
        description: str,
        full_name: str,
        phone: str,
        budget: float | None = None,
        city: str | None = None,
        email: str | None = None,
    ) -> dict:
        """"If we cannot find it, we make it." The best outcome short of a
        sale — a dead end becomes a lead."""
        try:
            body = RequestCreate(
                full_name=full_name,
                phone=phone,
                email=email,
                city=city,
                description=description,
                budget=budget,
                lang=lang,
                source="assistant",
            )
        except ValueError as exc:
            return {"error": f"Ask them again for this: {exc}"}
        request = await raise_request(db, body, None)
        return {
            "reference": request.reference,
            "next": "We read every one of these ourselves and come back with a price and a real date.",
        }

    async def track_order(reference_or_token: str) -> dict:
        value = reference_or_token.strip()
        order = await db.scalar(
            select(Order).where(
                (Order.reference == value.upper()) | (Order.tracking_token == value)
            )
        )
        if order is not None:
            return {
                "kind": "order",
                "reference": order.reference,
                "status": order.status.value,
                "total_mad": float(order.total),
                "placed_on": order.created_at.date().isoformat(),
            }
        request = await db.scalar(
            select(CustomRequest).where(
                (CustomRequest.reference == value.upper())
                | (CustomRequest.tracking_token == value)
            )
        )
        if request is not None:
            return {
                "kind": "custom_request",
                "reference": request.reference,
                "status": request.status.value,
                "quoted_mad": float(request.quote_price) if request.quote_price else None,
                "ready_on": request.promised_for.isoformat() if request.promised_for else None,
            }
        return {"error": "Nothing found with that reference"}

    async def escalate_to_human() -> dict:
        """Some things should be said by a person. In a market where trust is
        the scarce thing, being reachable is itself the product."""
        return {"ok": True, "_actions": [{"type": "open_whatsapp"}]}

    implementations = {
        "search_products": search_products,
        "get_product": get_product,
        "get_recommendations": get_recommendations,
        "add_to_cart": add_to_cart,
        "open_product": open_product,
        "go_to_checkout": go_to_checkout,
        "request_custom_item": request_custom_item,
        "track_order": track_order,
        "escalate_to_human": escalate_to_human,
    }

    _STR = {"type": "string"}
    _INT = {"type": "integer"}
    specs = [
        spec(
            "search_products",
            "Find pieces by words. Leave query empty to browse everything.",
            {"query": _STR, "kind": {"type": "string", "enum": ["shelf", "workshop"]}, "limit": _INT},
        ),
        spec(
            "get_product",
            "One piece in full: description, how it was made, options, how many are left.",
            {"slug": _STR},
            required=["slug"],
        ),
        spec(
            "get_recommendations",
            "Pieces chosen for this particular visitor. Use when they ask what we have.",
            {"limit": _INT},
        ),
        spec(
            "add_to_cart",
            "Put a piece in their cart, after they have chosen it.",
            {"product_id": _STR, "quantity": _INT, "variant_id": _STR},
            required=["product_id"],
        ),
        spec("open_product", "Show them a piece's page.", {"slug": _STR}, required=["slug"]),
        spec("go_to_checkout", "Take them to checkout so they can confirm and order.", {}),
        spec(
            "request_custom_item",
            "We do not have it, so we offer to make it. Needs their name and phone number.",
            {
                "description": _STR,
                "full_name": _STR,
                "phone": _STR,
                "budget": {"type": "number"},
                "city": _STR,
                "email": _STR,
            },
            required=["description", "full_name", "phone"],
        ),
        spec(
            "track_order",
            "Where an order or a custom request has got to, by its reference.",
            {"reference_or_token": _STR},
            required=["reference_or_token"],
        ),
        spec("escalate_to_human", "Open WhatsApp so a person can answer them.", {}),
    ]

    return Toolbox(
        system_prompt=SYSTEM_PROMPT,
        specs=specs,
        run=lambda name, arguments: dispatch(implementations, name, arguments),
    )
