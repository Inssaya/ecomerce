import asyncio
import json
import logging

import aio_pika

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Notification
from app.email import send_templated_email

logger = logging.getLogger(settings.service_name)

QUEUE_BINDINGS = {
    "order.placed": "orders",
    "order.assigned": "orders",
    "order.delivered": "orders",
    "order.cancelled": "orders",
    "kyc.approved": "kyc",
    "kyc.rejected": "kyc",
}


async def _save_in_app(user_id: str, event_type: str, title: str, body: str, payload: dict):
    async with AsyncSessionLocal() as db:
        notif = Notification(
            user_id=user_id,
            channel="in_app",
            type=event_type,
            title=title,
            body=body,
            payload=payload,
        )
        db.add(notif)
        await db.commit()


async def _handle_message(event_type: str, data: dict):
    handlers = {
        "order.placed": _handle_order_placed,
        "order.assigned": _handle_order_assigned,
        "order.delivered": _handle_order_delivered,
        "order.cancelled": _handle_order_cancelled,
        "kyc.approved": _handle_kyc_approved,
        "kyc.rejected": _handle_kyc_rejected,
    }
    handler = handlers.get(event_type)
    if handler:
        await handler(data)


async def _handle_order_placed(data: dict):
    user_id = data.get("buyer_user_id", "")
    email = data.get("buyer_email", "")
    order_id = data.get("order_id", "")
    total = data.get("total", 0)
    token = data.get("tracking_token", "")
    title = f"Order #{order_id[:8].upper()} confirmed"
    body_text = f"Your order has been received. Total: {total} MAD"
    await _save_in_app(user_id, "order.placed", title, body_text, data)
    if email:
        await send_templated_email(email, "order.placed", {"order_id": order_id[:8].upper(), "total": total, "tracking_token": token})


async def _handle_order_assigned(data: dict):
    user_id = data.get("buyer_user_id", "")
    order_id = data.get("order_id", "")
    title = "Your order is on its way!"
    body_text = f"Order #{order_id[:8].upper()} has been assigned to a delivery agent."
    await _save_in_app(user_id, "order.assigned", title, body_text, data)


async def _handle_order_delivered(data: dict):
    user_id = data.get("buyer_user_id", "")
    email = data.get("buyer_email", "")
    order_id = data.get("order_id", "")
    title = "Order delivered!"
    body_text = f"Order #{order_id[:8].upper()} has been delivered successfully. Thank you!"
    await _save_in_app(user_id, "order.delivered", title, body_text, data)
    if email:
        await send_templated_email(email, "order.delivered", {"order_id": order_id[:8].upper()})


async def _handle_order_cancelled(data: dict):
    user_id = data.get("buyer_user_id", "")
    order_id = data.get("order_id", "")
    title = "Order cancelled"
    body_text = f"Order #{order_id[:8].upper()} has been cancelled."
    await _save_in_app(user_id, "order.cancelled", title, body_text, data)


async def _handle_kyc_approved(data: dict):
    user_id = data.get("user_id", "")
    email = data.get("email", "")
    title = "Account verified"
    body_text = "Your account has been verified and is now active."
    await _save_in_app(user_id, "kyc.approved", title, body_text, data)
    if email:
        await send_templated_email(email, "kyc.approved", {})


async def _handle_kyc_rejected(data: dict):
    user_id = data.get("user_id", "")
    email = data.get("email", "")
    reason = data.get("rejection_reason", "")
    title = "Verification rejected"
    body_text = f"Your verification was rejected. Reason: {reason}"
    await _save_in_app(user_id, "kyc.rejected", title, body_text, data)
    if email:
        await send_templated_email(email, "kyc.rejected", {"rejection_reason": reason})


async def start_consumer():
    while True:
        try:
            connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            channel = await connection.channel()
            await channel.set_qos(prefetch_count=10)

            exchange = await channel.declare_exchange("ecomerce", aio_pika.ExchangeType.TOPIC, durable=True)
            queue = await channel.declare_queue("notification-service", durable=True)

            for routing_key in QUEUE_BINDINGS:
                await queue.bind(exchange, routing_key=routing_key)

            logger.info("Notification consumer started, listening for events")

            async with queue.iterator() as q:
                async for message in q:
                    async with message.process():
                        try:
                            payload = json.loads(message.body)
                            event_type = message.routing_key or ""
                            await _handle_message(event_type, payload)
                        except Exception as exc:
                            logger.error("Error processing message %s: %s", message.routing_key, exc)

        except Exception as exc:
            logger.error("Consumer connection error: %s — retrying in 5s", exc)
            await asyncio.sleep(5)
