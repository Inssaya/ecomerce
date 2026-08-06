"""Telling the customer what is happening with their order.

This replaces notification-service and its RabbitMQ consumer. The order module
calls `notify_order_status` directly — same process, same request. The broker,
the exchange, the queue bindings and the reconnect loop all existed to move a
dict from one container to another, and none of them are needed now.

BRAND.md §6: the customer is never surprised by the box. Every state change
says plainly what happened and what happens next, with a real date where one
exists — never "soon".
"""
from __future__ import annotations

import logging
from urllib.parse import quote

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Notification, Order, OrderStatus
from app.modules.notify.email import send_order_update

logger = logging.getLogger(__name__)


class Copy:
    """One status, both languages. Written per language, not translated."""

    __slots__ = ("heading_en", "heading_ar", "lines_en", "lines_ar")

    def __init__(self, heading_en: str, heading_ar: str, lines_en: list[str], lines_ar: list[str]):
        self.heading_en = heading_en
        self.heading_ar = heading_ar
        self.lines_en = lines_en
        self.lines_ar = lines_ar

    def heading(self, lang: str) -> str:
        return self.heading_ar if lang == "ar" else self.heading_en

    def body(self, lang: str) -> str:
        return " ".join(self.lines_ar if lang == "ar" else self.lines_en)


ORDER_COPY: dict[OrderStatus, Copy] = {
    OrderStatus.placed: Copy(
        "We have your order",
        "وصلنا طلبك",
        [
            "Order {reference}. You pay {total} MAD in cash when it reaches you — nothing before.",
            "We'll confirm it shortly and tell you the day it will be ready.",
        ],
        [
            "الطلب {reference}. تخلّص نقداً {total} درهم عند التسليم — لا شيء قبل ذلك.",
            "سنؤكّد الطلب قريباً ونخبرك باليوم الذي سيكون فيه جاهزاً.",
        ],
    ),
    OrderStatus.confirmed: Copy(
        "Your order is confirmed",
        "تم تأكيد طلبك",
        ["Order {reference} is confirmed. We start on it now."],
        ["تم تأكيد الطلب {reference}. سنبدأ العمل عليه الآن."],
    ),
    OrderStatus.preparing: Copy(
        "We're making it",
        "نحن نصنعه الآن",
        ["Order {reference} is on the bench. We'll tell you the moment it's finished."],
        ["الطلب {reference} على طاولة العمل. سنخبرك حالما ينتهي."],
    ),
    OrderStatus.ready: Copy(
        "It's finished",
        "القطعة جاهزة",
        ["Order {reference} is made and packed. It goes out for delivery next."],
        ["الطلب {reference} جاهز ومغلّف. سيخرج للتوصيل في الخطوة التالية."],
    ),
    OrderStatus.out_for_delivery: Copy(
        "On its way to you",
        "في الطريق إليك",
        [
            "Order {reference} is out for delivery today.",
            "Have {total} MAD ready in cash, and keep your phone nearby.",
        ],
        [
            "الطلب {reference} خرج للتوصيل اليوم.",
            "جهّز {total} درهم نقداً، وابقَ قريباً من هاتفك.",
        ],
    ),
    OrderStatus.delivered: Copy(
        "Delivered — thank you",
        "تم التسليم — شكراً لك",
        [
            "Order {reference} is with you. We made it, so if anything is wrong "
            "with it, tell us and we'll put it right.",
        ],
        [
            "الطلب {reference} وصل إليك. نحن من صنعه، فإن كان فيه أي خلل أخبرنا وسنُصلحه.",
        ],
    ),
    OrderStatus.cancelled: Copy(
        "Your order is cancelled",
        "تم إلغاء طلبك",
        ["Order {reference} is cancelled. You owe nothing."],
        ["تم إلغاء الطلب {reference}. لا شيء عليك."],
    ),
    OrderStatus.failed: Copy(
        "We couldn't hand it over",
        "لم نتمكّن من التسليم",
        [
            "We tried to deliver order {reference} and couldn't reach you.",
            "Reply to this message or send us a WhatsApp and we'll arrange another day.",
        ],
        [
            "حاولنا تسليم الطلب {reference} ولم نتمكّن من الوصول إليك.",
            "ردّ على هذه الرسالة أو راسلنا على واتساب ونتّفق على يوم آخر.",
        ],
    ),
    OrderStatus.returned: Copy(
        "Your order came back to the workshop",
        "عاد طلبك إلى الورشة",
        ["Order {reference} is back with us. You owe nothing."],
        ["الطلب {reference} عاد إلينا. لا شيء عليك."],
    ),
}


def track_url(order: Order) -> str:
    return f"{settings.app_url}/{order.lang}/track/{order.tracking_token}"


def whatsapp_url(order: Order) -> str:
    """Click-to-chat handoff. Always available; the Business API is not
    required for the customer to be able to reach a person."""
    if not settings.whatsapp_number:
        return ""
    text = (
        f"مرحبا، بخصوص الطلب {order.reference}"
        if order.lang == "ar"
        else f"Hello, about order {order.reference}"
    )
    return f"https://wa.me/{settings.whatsapp_number}?text={quote(text)}"


async def notify_order_status(db: AsyncSession, order: Order) -> None:
    """In-app for signed-in customers, email for anyone who left an address.

    Never raises: a notification failure must not roll back the state change it
    was reporting on.
    """
    copy = ORDER_COPY.get(order.status)
    if copy is None:
        return

    fields = {"reference": order.reference, "total": f"{order.total:.0f}"}
    lang = order.lang

    if order.customer_id:
        db.add(
            Notification(
                user_id=order.customer_id,
                kind=f"order.{order.status.value}",
                title=copy.heading(lang),
                body=copy.body(lang).format(**fields),
                payload={"order_id": order.id, "reference": order.reference},
            )
        )
        await db.commit()

    if order.customer_email:
        try:
            await send_order_update(
                to=order.customer_email,
                lang=lang,
                reference=order.reference,
                heading_en=copy.heading_en,
                heading_ar=copy.heading_ar,
                lines_en=[line.format(**fields) for line in copy.lines_en],
                lines_ar=[line.format(**fields) for line in copy.lines_ar],
                track_url=track_url(order),
            )
        except Exception as exc:
            logger.error("Order %s: could not email %s: %s", order.reference, order.customer_email, exc)
