import json
import secrets
from datetime import datetime, timezone

import aio_pika
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Order, OrderEvent, OrderItem, OrderStatus
from app.schemas import CheckoutRequest, OrderResponse


class StatusUpdate(BaseModel):
    status: OrderStatus
    note: str | None = None

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("/checkout", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def checkout(
    body: CheckoutRequest,
    x_user_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not body.cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    subtotal = sum(i.price * i.quantity for i in body.cart_items)
    delivery_fee = settings.delivery_fee_default
    total = subtotal + delivery_fee

    order = Order(
        tracking_token=secrets.token_urlsafe(32),
        buyer_user_id=x_user_id,
        buyer_email=body.email,
        buyer_name=body.full_name,
        buyer_phone=body.phone,
        delivery_address=body.delivery_address.model_dump(),
        subtotal=subtotal,
        delivery_fee=delivery_fee,
        total=total,
        notes=body.notes,
    )
    db.add(order)
    await db.flush()

    for item in body.cart_items:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=item.product_id,
                seller_id=item.seller_id,
                title=item.title,
                price=item.price,
                quantity=item.quantity,
                subtotal=round(item.price * item.quantity, 2),
                image_url=item.image_url,
            )
        )

    db.add(OrderEvent(order_id=order.id, status=OrderStatus.pending, actor_type="system"))
    await db.commit()

    result = await db.execute(select(Order).where(Order.id == order.id))
    saved = result.scalar_one()

    # Publish order.placed event
    try:
        connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        channel = await connection.channel()
        exchange = await channel.declare_exchange("ecomerce", aio_pika.ExchangeType.TOPIC, durable=True)
        payload = {
            "order_id": saved.id,
            "tracking_token": saved.tracking_token,
            "buyer_user_id": saved.buyer_user_id or "",
            "buyer_email": saved.buyer_email,
            "total": saved.total,
        }
        await exchange.publish(
            aio_pika.Message(body=json.dumps(payload).encode()),
            routing_key="order.placed",
        )
        await connection.close()
    except Exception:
        pass

    return saved


@router.get("/track/{tracking_token}", response_model=OrderResponse)
async def track_order(tracking_token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.tracking_token == tracking_token))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.get("/mine", response_model=list[OrderResponse])
async def my_orders(
    x_user_id: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Login required")
    result = await db.execute(
        select(Order).where(Order.buyer_user_id == x_user_id).order_by(Order.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if x_user_role not in ("admin",) and order.buyer_user_id != x_user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return order


@router.put("/{order_id}/status", response_model=OrderResponse)
async def update_status(
    order_id: str,
    body: StatusUpdate,
    x_user_id: str | None = Header(default=None),
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role not in ("admin", "delivery_individual", "delivery_company"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = order.status
    order.status = body.status
    db.add(OrderEvent(
        order_id=order.id, status=body.status,
        actor_id=x_user_id, actor_type=x_user_role or "system", note=body.note,
    ))
    await db.commit()

    # Publish status change event
    event_map = {
        OrderStatus.delivered_paid: "order.delivered",
        OrderStatus.cancelled: "order.cancelled",
        OrderStatus.assigned: "order.assigned",
    }
    if body.status in event_map:
        try:
            connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            channel = await connection.channel()
            exchange = await channel.declare_exchange("ecomerce", aio_pika.ExchangeType.TOPIC, durable=True)
            payload = {
                "order_id": order.id,
                "buyer_user_id": order.buyer_user_id or "",
                "buyer_email": order.buyer_email,
                "status": body.status.value,
            }
            await exchange.publish(
                aio_pika.Message(body=json.dumps(payload).encode()),
                routing_key=event_map[body.status],
            )
            await connection.close()
        except Exception:
            pass

    result = await db.execute(select(Order).where(Order.id == order.id))
    return result.scalar_one()


@router.get("/stats", tags=["admin"])
async def order_stats(
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    total_result = await db.execute(select(func.count()).select_from(Order))
    revenue_result = await db.execute(
        select(func.sum(Order.total)).where(Order.status == OrderStatus.delivered_paid)
    )
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_result = await db.execute(
        select(func.count()).where(Order.created_at >= today_start)
    )
    return {
        "total": total_result.scalar() or 0,
        "today": today_result.scalar() or 0,
        "revenue": float(revenue_result.scalar() or 0),
    }


@router.get("", response_model=list[OrderResponse], tags=["admin"])
async def list_all_orders(
    page: int = 1,
    size: int = 50,
    status_filter: OrderStatus | None = None,
    x_user_role: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    query = select(Order).order_by(Order.created_at.desc()).offset((page - 1) * size).limit(size)
    if status_filter:
        query = query.where(Order.status == status_filter)
    result = await db.execute(query)
    return result.scalars().all()
