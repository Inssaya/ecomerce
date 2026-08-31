"""No stock, no kind, no price range, no product on a custom request.

The owner's four remaining reversals from `docs/DECISIONS.md`, in one
migration because they are the same underlying change seen from four
columns: there is nothing left in this schema that counts, categorises by
manufacturing method, or ranges a price.

* **`pieces.state`** and the `piece_state` enum — "available / reserved /
  sold / kept" was the last piece of the stock system. `pieces` itself is
  NOT dropped: `order_items.piece_id` is `ondelete=RESTRICT` and live orders
  placed before this migration still reference specific rows, so the table
  stays as read-only history. Nothing creates a new row in it any more —
  the piece-adding/removing endpoints and the "tell me when you make
  another" waitlist (`piece_alerts`) are gone with the code that wrote to
  them, which is why `piece_alerts` is dropped outright rather than kept
  empty.
* **`products.kind`** and the `product_kind` enum — distinguished "shelf"
  from "made to order" for exactly two reasons (stock counting, a
  manufacturing-time promise), and both are already gone.
* **`products.price_max`** — one price per product, not a range.
* **`products.show_piece_numbers`**, **`products.batch_closed`** — both
  governed the piece-numbering display ("Piece 04 of 12"), which is the
  same feature the stock system was.
* **`custom_requests.product_id`** — a custom request starts from the
  customer's own idea, not a catalogue row; nothing has ever set this to
  non-null in the current codebase.

Downgrade restores structure, not data — the same shape as
`20260814_1600_the_shop_states_no_time.py`. A `piece_alerts` row, a
`pieces.state`, a `products.kind` all come back empty; what they held is
gone with the columns.

Revision ID: d84f1a6e9c37
Revises: c2e5b8a71f04
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "d84f1a6e9c37"
down_revision = "c2e5b8a71f04"
branch_labels = None
depends_on = None

_KIND_VALUES = ("shelf", "workshop")
_PIECE_STATE_VALUES = ("available", "reserved", "sold", "kept")

product_kind = sa.Enum(*_KIND_VALUES, name="product_kind")
piece_state = sa.Enum(*_PIECE_STATE_VALUES, name="piece_state")
# `create_type=False` on the column definitions below: the type is created
# and dropped once, explicitly, not once per column that happens to use it.
kind_col = postgresql.ENUM(*_KIND_VALUES, name="product_kind", create_type=False)
state_col = postgresql.ENUM(*_PIECE_STATE_VALUES, name="piece_state", create_type=False)


def upgrade() -> None:
    # ── piece_alerts: the whole table, its trigger is gone ──
    op.drop_index("ix_alerts_pending", table_name="piece_alerts")
    op.drop_index(op.f("ix_piece_alerts_created_at"), table_name="piece_alerts")
    op.drop_index(op.f("ix_piece_alerts_phone"), table_name="piece_alerts")
    op.drop_index(op.f("ix_piece_alerts_product_id"), table_name="piece_alerts")
    op.drop_table("piece_alerts")

    # ── custom_requests.product_id ──
    op.drop_column("custom_requests", "product_id")

    # ── pieces.state (the table itself stays — see the module docstring) ──
    op.drop_index("ix_pieces_product_state", table_name="pieces")
    op.drop_column("pieces", "state")
    piece_state.drop(op.get_bind(), checkfirst=True)

    # ── products.kind ──
    op.drop_index(op.f("ix_products_kind"), table_name="products")
    op.drop_column("products", "kind")
    product_kind.drop(op.get_bind(), checkfirst=True)

    # ── products.price_max / show_piece_numbers / batch_closed ──
    op.drop_column("products", "price_max")
    op.drop_column("products", "show_piece_numbers")
    op.drop_column("products", "batch_closed")


def downgrade() -> None:
    # ── products.price_max / show_piece_numbers / batch_closed ──
    op.add_column(
        "products",
        sa.Column("batch_closed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "products",
        sa.Column("show_piece_numbers", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "products", sa.Column("price_max", sa.Numeric(precision=10, scale=2), nullable=True)
    )

    # ── products.kind ──
    product_kind.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "products", sa.Column("kind", kind_col, nullable=False, server_default="shelf")
    )
    op.create_index(op.f("ix_products_kind"), "products", ["kind"], unique=False)

    # ── pieces.state ──
    piece_state.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "pieces", sa.Column("state", state_col, nullable=False, server_default="available")
    )
    op.create_index("ix_pieces_product_state", "pieces", ["product_id", "state"], unique=False)

    # ── custom_requests.product_id ──
    op.add_column(
        "custom_requests", sa.Column("product_id", sa.UUID(as_uuid=False), nullable=True)
    )
    op.create_foreign_key(
        "custom_requests_product_id_fkey",
        "custom_requests",
        "products",
        ["product_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ── piece_alerts ──
    op.create_table(
        "piece_alerts",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("product_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("lang", sa.String(length=2), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "phone", name="uq_alert_product_phone"),
    )
    op.create_index(
        "ix_alerts_pending", "piece_alerts", ["product_id", "notified_at"], unique=False
    )
    op.create_index(
        op.f("ix_piece_alerts_created_at"), "piece_alerts", ["created_at"], unique=False
    )
    op.create_index(op.f("ix_piece_alerts_phone"), "piece_alerts", ["phone"], unique=False)
    op.create_index(
        op.f("ix_piece_alerts_product_id"), "piece_alerts", ["product_id"], unique=False
    )
