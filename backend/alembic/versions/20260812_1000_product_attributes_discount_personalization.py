"""Describe a piece properly, and let it go on offer.

Four things the catalogue could not say, all of them asked for at once:

* **A reduction.** Three columns rather than a second price, because the owner
  wanted to switch an offer off without forgetting what it was.
* **Delivery time on any piece.** `lead_time_days` is the workshop's promise
  about making a thing, and a check constraint ties it to made-to-order
  pieces; it could never carry a shelf piece's delivery estimate.
* **Their name on it.** A toggle and a percentage — hand work on one specific
  object costs more than the same object without it.
* **Measures, colours and materials**, in one flexible table. A piece may have
  a size and nothing else, or three colours and a material. `product_variants`
  could not express that: one option string per buyable configuration means a
  piece in four colours and three sizes is twelve rows to type.

Nothing is dropped here. `product_variants` stays exactly as it is — live
order lines point at it — it simply leaves the console.

Revision ID: d41a7c9b6e02
Revises: c3f1a8b52d64
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "d41a7c9b6e02"
down_revision = "c3f1a8b52d64"
branch_labels = None
depends_on = None

# Two forms of each enum, following the convention set in
# `20260806_0710_shelf_and_workshop_variants_pieces`: the `sa.Enum` CREATEs the
# type once, and the columns reference a `postgresql.ENUM(create_type=False)`
# so SQLAlchemy does not emit a second CREATE TYPE per column and fail.
_DISCOUNT_VALUES = ("percent", "fixed")
_GROUP_VALUES = ("measure", "color", "material")

discount_kind = sa.Enum(*_DISCOUNT_VALUES, name="discount_kind")
attribute_group = sa.Enum(*_GROUP_VALUES, name="attribute_group")

discount_col = postgresql.ENUM(*_DISCOUNT_VALUES, name="discount_kind", create_type=False)
group_col = postgresql.ENUM(*_GROUP_VALUES, name="attribute_group", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    discount_kind.create(bind, checkfirst=True)
    attribute_group.create(bind, checkfirst=True)

    # ── the reduction ─────────────────────────────────────────────────────────
    op.add_column("products", sa.Column("discount_kind", discount_col, nullable=True))
    op.add_column("products", sa.Column("discount_value", sa.Numeric(10, 2), nullable=True))
    op.add_column(
        "products",
        sa.Column("discount_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # ── delivery, and their name on it ────────────────────────────────────────
    op.add_column("products", sa.Column("delivery_days", sa.Integer(), nullable=True))
    op.add_column(
        "products",
        sa.Column("personalizable", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "products",
        sa.Column(
            "personalization_markup_pct", sa.Numeric(5, 2), nullable=False, server_default="0"
        ),
    )

    # ── specification ─────────────────────────────────────────────────────────
    op.create_table(
        "product_attributes",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("product_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("group", group_col, nullable=False),
        # Null means the value speaks for itself: "M", "Wood".
        sa.Column("name", sa.String(length=60), nullable=True),
        sa.Column("value", sa.String(length=120), nullable=False),
        sa.Column("hex", sa.String(length=7), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_product_attributes_product_id", "product_attributes", ["product_id"])
    op.create_index(
        "ix_product_attributes_product_group", "product_attributes", ["product_id", "group"]
    )

    # The defaults existed only to fill the rows already in the table. Left in
    # place they would let a future insert that forgets the field succeed
    # quietly, and the models would stop being the whole description of the
    # schema — which is the rule the rest of this directory follows.
    op.alter_column("products", "discount_active", server_default=None)
    op.alter_column("products", "personalizable", server_default=None)
    op.alter_column("products", "personalization_markup_pct", server_default=None)
    op.alter_column("product_attributes", "display_order", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_product_attributes_product_group", table_name="product_attributes")
    op.drop_index("ix_product_attributes_product_id", table_name="product_attributes")
    op.drop_table("product_attributes")

    op.drop_column("products", "personalization_markup_pct")
    op.drop_column("products", "personalizable")
    op.drop_column("products", "delivery_days")
    op.drop_column("products", "discount_active")
    op.drop_column("products", "discount_value")
    op.drop_column("products", "discount_kind")

    attribute_group.drop(op.get_bind(), checkfirst=True)
    discount_kind.drop(op.get_bind(), checkfirst=True)
