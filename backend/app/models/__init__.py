"""Every model in one package, so Alembic sees the whole schema at once."""
from app.models.alerts import PieceAlert
from app.models.base import BilingualMixin, TimestampMixin, new_id, uuid_fk, uuid_pk
from app.models.catalog import (
    EMBEDDING_DIMENSIONS,
    Category,
    Piece,
    PieceState,
    Product,
    ProductEmbedding,
    ProductKind,
    ProductMedia,
    ProductStatus,
    ProductVariant,
)
from app.models.local import City, Service
from app.models.orders import (
    ALLOWED_TRANSITIONS,
    TERMINAL_STATUSES,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
)
from app.models.requests import (
    REQUEST_TRANSITIONS,
    CustomRequest,
    RequestEvent,
    RequestStatus,
)
from app.models.signals import (
    AFFINITY_HALF_LIFE_DAYS,
    DEFAULT_FEED_WEIGHTS,
    FEED_WEIGHT_COPY,
    MAX_DWELL_WEIGHT,
    SIGNAL_WEIGHTS,
    FeedWeight,
    Signal,
    SignalType,
)
from app.models.user import RefreshToken, User, UserRole

__all__ = [
    "City",
    "Service",
    "AFFINITY_HALF_LIFE_DAYS",
    "PieceAlert",
    "REQUEST_TRANSITIONS",
    "CustomRequest",
    "RequestEvent",
    "RequestStatus",
    "DEFAULT_FEED_WEIGHTS",
    "FEED_WEIGHT_COPY",
    "ALLOWED_TRANSITIONS",
    "EMBEDDING_DIMENSIONS",
    "FeedWeight",
    "MAX_DWELL_WEIGHT",
    "SIGNAL_WEIGHTS",
    "TERMINAL_STATUSES",
    "BilingualMixin",
    "Category",
    "Order",
    "OrderEvent",
    "OrderItem",
    "OrderStatus",
    "Piece",
    "PieceState",
    "Product",
    "ProductEmbedding",
    "ProductKind",
    "ProductMedia",
    "ProductStatus",
    "ProductVariant",
    "RefreshToken",
    "Signal",
    "SignalType",
    "TimestampMixin",
    "User",
    "UserRole",
    "new_id",
    "uuid_fk",
    "uuid_pk",
]
