from datetime import datetime
from pydantic import BaseModel, EmailStr, Field
from app.models import OrderStatus


class Address(BaseModel):
    street: str
    city: str
    region: str = ""
    zip: str = ""
    country: str = "MA"


class CartItemIn(BaseModel):
    product_id: str
    title: str
    price: float = Field(gt=0)
    quantity: int = Field(ge=1, default=1)
    image_url: str | None = None
    seller_id: str


class CheckoutRequest(BaseModel):
    email: EmailStr
    full_name: str
    phone: str
    delivery_address: Address
    notes: str | None = None
    cart_items: list[CartItemIn]


class OrderItemResponse(BaseModel):
    id: str
    product_id: str
    seller_id: str
    title: str
    price: float
    quantity: int
    subtotal: float
    image_url: str | None

    model_config = {"from_attributes": True}


class OrderEventResponse(BaseModel):
    id: str
    status: OrderStatus
    actor_type: str
    note: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}


class OrderResponse(BaseModel):
    id: str
    tracking_token: str
    buyer_email: str
    buyer_name: str
    buyer_phone: str
    delivery_address: dict
    items: list[OrderItemResponse]
    events: list[OrderEventResponse]
    subtotal: float
    delivery_fee: float
    total: float
    status: OrderStatus
    payment_method: str
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
