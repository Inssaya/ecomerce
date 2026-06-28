import asyncio
import json
import logging

import aio_pika
from sqlalchemy import func, update

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Product
from app.search import index_product, product_to_doc

logger = logging.getLogger("catalog.consumer")


async def _decrement_stock(items: list[dict]) -> None:
    async with AsyncSessionLocal() as db:
        for item in items:
            product_id = item.get("product_id", "")
            quantity = int(item.get("quantity", 1))
            if not product_id:
                continue
            await db.execute(
                update(Product)
                .where(Product.id == product_id)
                .values(stock=func.greatest(0, Product.stock - quantity))
            )
        await db.commit()

    # Re-index updated products in Meilisearch
    async with AsyncSessionLocal() as db:
        from sqlalchemy import select
        for item in items:
            product_id = item.get("product_id", "")
            if not product_id:
                continue
            result = await db.execute(
                select(Product).where(Product.id == product_id)
            )
            product = result.scalar_one_or_none()
            if product:
                await index_product(product_to_doc(product))


async def start_consumer() -> None:
    while True:
        try:
            connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            channel = await connection.channel()
            await channel.set_qos(prefetch_count=10)

            exchange = await channel.declare_exchange(
                "ecomerce", aio_pika.ExchangeType.TOPIC, durable=True
            )
            queue = await channel.declare_queue("catalog-service", durable=True)
            await queue.bind(exchange, routing_key="order.placed")

            logger.info("Catalog consumer started, listening for order.placed")

            async with queue.iterator() as q:
                async for message in q:
                    async with message.process():
                        try:
                            payload = json.loads(message.body)
                            items = payload.get("items", [])
                            if items:
                                await _decrement_stock(items)
                                logger.info(
                                    "Stock decremented for order %s (%d items)",
                                    payload.get("order_id", ""),
                                    len(items),
                                )
                        except Exception as exc:
                            logger.error("Error processing order.placed: %s", exc)

        except Exception as exc:
            logger.error("Catalog consumer error: %s — retrying in 5s", exc)
            await asyncio.sleep(5)
