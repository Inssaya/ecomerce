import asyncio
import json
import logging

import aio_pika
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import CommissionLedger, SellerProfile

logger = logging.getLogger(settings.service_name)


async def _handle_order_delivered(data: dict):
    """Create commission ledger entries for each seller in the delivered order."""
    order_id = data.get("order_id", "")
    items = data.get("items", [])  # list of {seller_id, subtotal}

    if not items:
        logger.warning("order.delivered event has no items for order %s", order_id)
        return

    async with AsyncSessionLocal() as db:
        for item in items:
            seller_id = item.get("seller_id")
            gross = float(item.get("subtotal", 0))
            if not seller_id or gross <= 0:
                continue

            # Look up commission rate
            result = await db.execute(
                select(SellerProfile).where(SellerProfile.user_id == seller_id)
            )
            profile = result.scalar_one_or_none()
            rate = profile.commission_rate if profile else settings.default_commission_rate
            commission = round(gross * rate, 2)
            net = round(gross - commission, 2)

            # Idempotency: skip if already exists
            existing = await db.execute(
                select(CommissionLedger).where(
                    CommissionLedger.order_id == order_id,
                    CommissionLedger.seller_id == seller_id,
                )
            )
            if existing.scalar_one_or_none():
                continue

            ledger = CommissionLedger(
                order_id=order_id,
                seller_id=seller_id,
                gross_amount=gross,
                commission_rate=rate,
                commission_amount=commission,
                net_amount=net,
            )
            db.add(ledger)

            if profile:
                profile.payout_balance = round((profile.payout_balance or 0) + net, 2)

        await db.commit()
    logger.info("Commission ledger updated for order %s", order_id)


async def start_consumer():
    while True:
        try:
            connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            channel = await connection.channel()
            await channel.set_qos(prefetch_count=10)

            exchange = await channel.declare_exchange(
                "ecomerce", aio_pika.ExchangeType.TOPIC, durable=True
            )
            queue = await channel.declare_queue("seller-service", durable=True)
            await queue.bind(exchange, routing_key="order.delivered")

            logger.info("Seller consumer started")

            async with queue.iterator() as q:
                async for message in q:
                    async with message.process():
                        try:
                            payload = json.loads(message.body)
                            if message.routing_key == "order.delivered":
                                await _handle_order_delivered(payload)
                        except Exception as exc:
                            logger.error("Error processing %s: %s", message.routing_key, exc)

        except Exception as exc:
            logger.error("Seller consumer error: %s — retrying in 5s", exc)
            await asyncio.sleep(5)
