"""Every model in one package, so Alembic sees the whole schema at once."""
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
from app.models.notify import Notification
from app.models.orders import (
    ALLOWED_TRANSITIONS,
    TERMINAL_STATUSES,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
)
from app.models.signals import (
    AFFINITY_HALF_LIFE_DAYS,
    MAX_DWELL_WEIGHT,
    SIGNAL_WEIGHTS,
    Signal,
    SignalType,
)
from app.models.user import RefreshToken, User, UserRole

__all__ = [
    "AFFINITY_HALF_LIFE_DAYS",
    "ALLOWED_TRANSITIONS",
    "EMBEDDING_DIMENSIONS",
    "MAX_DWELL_WEIGHT",
    "SIGNAL_WEIGHTS",
    "TERMINAL_STATUSES",
    "BilingualMixin",
    "Category",
    "Notification",
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
