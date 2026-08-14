"""Hearts and buy-later saves, and what the buyer actually picked.

Two features that only exist together, because their storage is the point.

* **`product_interactions`** is one row per (visitor, product, kind) — Pinterest-
  shaped hearts and buy-later saves. Keyed on the same fingerprint the feed and
  `Signal` are, because most reactions happen before anyone signs in. The
  unique constraint is what makes the toggle honest: pressing "like" twice is
  one row, not two, and the endpoint's job is to insert-or-remove rather than
  count clicks. Aggregating stays a plain `count(*)`.

* **`orders.visitor_id`** and **`order_items.selection` / `.personalization`**
  are the buyer's side of the choices the console now lets the workshop set.
  `visitor_id` is the join key that lets a customer's saves and hearts show up
  under their phone bucket — without it, "total saves per customer" is zero
  for every guest, and guests are most of this shop. `selection` is a JSON
  snapshot of the measures/colours/materials the buyer picked, so relabelling
  an attribute later never rewrites last month's receipt. `personalization`
  is the customer's name for the object, capped at 20 characters — the price
  on the row already carries the markup.

Revision ID: e58b2d0f7a13
Revises: d41a7c9b6e02
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "e58b2d0f7a13"
down_revision = "d41a7c9b6e02"
branch_labels = None
depends_on = None

# Same two-form pattern as the other enums in this directory: the `sa.Enum`
# CREATEs the type once, the `postgresql.ENUM(create_type=False)` is what the
# column references so SQLAlchemy does not try to CREATE it a second time.
_KIND_VALUES = ("like", "save")

interaction_kind = sa.Enum(*_KIND_VALUES, name="interaction_kind")
kind_col = postgresql.ENUM(*_KIND_VALUES, name="interaction_kind", create_type=False)


def upgrade() -> None:
    interaction_kind.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "product_interactions",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("product_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("kind", kind_col, nullable=False),
        sa.Column("visitor_id", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "product_id", "visitor_id", "kind", name="uq_interaction_visitor"
        ),
    )
    op.create_index("ix_product_interactions_product_id", "product_interactions", ["product_id"])
    op.create_index("ix_product_interactions_user_id", "product_interactions", ["user_id"])
    op.create_index(
        "ix_product_interactions_product_kind",
        "product_interactions",
        ["product_id", "kind"],
    )
    op.create_index(
        "ix_product_interactions_visitor", "product_interactions", ["visitor_id"]
    )

    op.add_column("orders", sa.Column("visitor_id", sa.String(length=80), nullable=True))
    op.create_index("ix_orders_visitor_id", "orders", ["visitor_id"])

    op.add_column(
        "order_items",
        sa.Column("selection", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "order_items", sa.Column("personalization", sa.String(length=20), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("order_items", "personalization")
    op.drop_column("order_items", "selection")

    op.drop_index("ix_orders_visitor_id", table_name="orders")
    op.drop_column("orders", "visitor_id")

    op.drop_index("ix_product_interactions_visitor", table_name="product_interactions")
    op.drop_index("ix_product_interactions_product_kind", table_name="product_interactions")
    op.drop_index("ix_product_interactions_user_id", table_name="product_interactions")
    op.drop_index("ix_product_interactions_product_id", table_name="product_interactions")
    op.drop_table("product_interactions")

    interaction_kind.drop(op.get_bind(), checkfirst=True)
