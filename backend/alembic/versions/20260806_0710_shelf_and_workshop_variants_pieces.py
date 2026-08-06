"""shelf and workshop, variants, pieces, signals, embeddings

The two offers become two kinds of product, availability stops being a number
someone types in and becomes a count of objects that exist, and the store
starts recording what people look at.

Autogenerate got the shape of this right and the safety of it wrong, so it is
written out by hand. Four things it produced would have failed or lost data on
a database that already has rows:

* `NOT NULL` columns added with no default — each needs a server default to be
  applied to a table that is not empty.
* `products.stock` dropped outright. The count it held is the entire shelf, so
  it is migrated into real `pieces` rows first.
* The `vector` extension was never created, and `pgvector.sqlalchemy` was
  referenced without being imported.
* Foreign keys created with `None` for a name, which the downgrade then cannot
  drop.

Revision ID: 8a049e80b37e
Revises: 421dd3d9bc04
Create Date: 2026-08-06 07:10:32.002150
"""
from __future__ import annotations

from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "8a049e80b37e"
down_revision: str | None = "421dd3d9bc04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMBEDDING_DIMENSIONS = 1536

# Two forms of each enum on purpose. The `sa.Enum` is what CREATEs the type,
# once, at the top of the migration. The `postgresql.ENUM(create_type=False)`
# is what the columns reference — without that flag SQLAlchemy emits its own
# CREATE TYPE for every column that uses it, and the second one fails.
_KIND_VALUES = ("shelf", "workshop")
_PIECE_VALUES = ("available", "reserved", "sold", "kept")
_SIGNAL_VALUES = (
    "impression", "click", "dwell", "scroll_depth", "search", "add_to_cart", "purchase",
)

product_kind = sa.Enum(*_KIND_VALUES, name="product_kind")
piece_state = sa.Enum(*_PIECE_VALUES, name="piece_state")
signal_type = sa.Enum(*_SIGNAL_VALUES, name="signal_type")

kind_col = postgresql.ENUM(*_KIND_VALUES, name="product_kind", create_type=False)
piece_col = postgresql.ENUM(*_PIECE_VALUES, name="piece_state", create_type=False)
signal_col = postgresql.ENUM(*_SIGNAL_VALUES, name="signal_type", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    product_kind.create(bind, checkfirst=True)
    piece_state.create(bind, checkfirst=True)
    signal_type.create(bind, checkfirst=True)

    # ── products ──────────────────────────────────────────────────────────────
    # Everything that exists today was made before there was a workshop offer,
    # so all of it is shelf stock.
    op.add_column(
        "products", sa.Column("kind", kind_col, nullable=False, server_default="shelf")
    )
    op.add_column("products", sa.Column("story_en", sa.Text(), nullable=False, server_default=""))
    op.add_column("products", sa.Column("story_ar", sa.Text(), nullable=False, server_default=""))
    op.add_column("products", sa.Column("made_on", sa.Date(), nullable=True))
    op.add_column(
        "products",
        sa.Column("batch_closed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "products",
        sa.Column("show_piece_numbers", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("products", sa.Column("lead_time_days", sa.Integer(), nullable=True))
    op.add_column(
        "products", sa.Column("price_max", sa.Numeric(precision=10, scale=2), nullable=True)
    )
    op.add_column(
        "products",
        sa.Column(
            "business_boost", sa.Numeric(precision=4, scale=2), nullable=False, server_default="1"
        ),
    )
    op.create_index(op.f("ix_products_kind"), "products", ["kind"], unique=False)
    op.create_check_constraint(
        "ck_workshop_has_lead_time",
        "products",
        "kind <> 'workshop' OR lead_time_days IS NOT NULL",
    )

    op.add_column(
        "product_media",
        sa.Column("is_process_footage", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # ── variants ──────────────────────────────────────────────────────────────
    op.create_table(
        "product_variants",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("product_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("sku", sa.String(length=60), nullable=False),
        sa.Column("option_en", sa.String(length=160), nullable=False),
        sa.Column("option_ar", sa.String(length=160), nullable=False, server_default=""),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_product_variants_product_id"), "product_variants", ["product_id"], unique=False
    )
    op.create_index(op.f("ix_product_variants_sku"), "product_variants", ["sku"], unique=True)

    # ── pieces ────────────────────────────────────────────────────────────────
    op.create_table(
        "pieces",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("product_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("variant_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("batch_size", sa.Integer(), nullable=False),
        sa.Column("state", piece_col, nullable=False, server_default="available"),
        sa.Column("made_on", sa.Date(), nullable=True),
        sa.Column("photo_url", sa.String(length=1000), nullable=True),
        sa.Column("note_en", sa.Text(), nullable=False, server_default=""),
        sa.Column("note_ar", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variant_id"], ["product_variants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "number", name="uq_piece_number"),
    )
    op.create_index(op.f("ix_pieces_product_id"), "pieces", ["product_id"], unique=False)
    op.create_index("ix_pieces_product_state", "pieces", ["product_id", "state"], unique=False)
    op.create_index(op.f("ix_pieces_variant_id"), "pieces", ["variant_id"], unique=False)

    # A product that said it had four in stock now has four numbered pieces.
    # Dropping the column without this would quietly empty the shop.
    op.execute(
        """
        INSERT INTO pieces (id, product_id, number, batch_size, state)
        SELECT gen_random_uuid(), p.id, n, p.stock, 'available'
        FROM products p
        CROSS JOIN LATERAL generate_series(1, p.stock) AS n
        WHERE p.stock > 0
        """
    )
    op.drop_column("products", "stock")

    # ── order lines point at what was actually bought ─────────────────────────
    op.add_column("order_items", sa.Column("variant_id", sa.UUID(as_uuid=False), nullable=True))
    op.add_column("order_items", sa.Column("piece_id", sa.UUID(as_uuid=False), nullable=True))
    op.add_column(
        "order_items",
        sa.Column("variant_label", sa.String(length=160), nullable=False, server_default=""),
    )
    op.add_column(
        "order_items",
        sa.Column("piece_label", sa.String(length=20), nullable=False, server_default=""),
    )
    op.add_column("order_items", sa.Column("lead_time_days", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_order_items_variant_id"), "order_items", ["variant_id"], unique=False)
    op.create_index(op.f("ix_order_items_piece_id"), "order_items", ["piece_id"], unique=False)
    op.create_foreign_key(
        "fk_order_items_variant_id",
        "order_items",
        "product_variants",
        ["variant_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_order_items_piece_id",
        "order_items",
        "pieces",
        ["piece_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # ── signals ───────────────────────────────────────────────────────────────
    op.create_table(
        "signals",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("visitor_id", sa.String(length=80), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("type", signal_col, nullable=False),
        sa.Column("weight", sa.Numeric(precision=6, scale=3), nullable=False),
        sa.Column("product_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("category_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("query", sa.Text(), nullable=True),
        sa.Column("value", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_signals_visitor_recent", "signals", ["visitor_id", "created_at"])
    op.create_index("ix_signals_product_recent", "signals", ["product_id", "created_at"])
    op.create_index("ix_signals_category_recent", "signals", ["category_id", "created_at"])
    op.create_index(op.f("ix_signals_user_id"), "signals", ["user_id"], unique=False)

    # ── embeddings ────────────────────────────────────────────────────────────
    op.create_table(
        "product_embeddings",
        sa.Column("product_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(EMBEDDING_DIMENSIONS), nullable=False),
        sa.Column("model", sa.String(length=80), nullable=False),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("product_id"),
    )
    # Cosine distance, which is what a normalised text embedding compares on.
    # `lists` is deliberately small — it should be around rows/1000, and this
    # catalogue is short on purpose.
    op.execute(
        "CREATE INDEX ix_product_embeddings_cosine ON product_embeddings "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)"
    )


def downgrade() -> None:
    op.drop_table("product_embeddings")

    op.drop_index(op.f("ix_signals_user_id"), table_name="signals")
    op.drop_index("ix_signals_category_recent", table_name="signals")
    op.drop_index("ix_signals_product_recent", table_name="signals")
    op.drop_index("ix_signals_visitor_recent", table_name="signals")
    op.drop_table("signals")

    op.drop_constraint("fk_order_items_piece_id", "order_items", type_="foreignkey")
    op.drop_constraint("fk_order_items_variant_id", "order_items", type_="foreignkey")
    op.drop_index(op.f("ix_order_items_piece_id"), table_name="order_items")
    op.drop_index(op.f("ix_order_items_variant_id"), table_name="order_items")
    for column in ("lead_time_days", "piece_label", "variant_label", "piece_id", "variant_id"):
        op.drop_column("order_items", column)

    # Fold the pieces back into a count before the table goes.
    op.add_column("products", sa.Column("stock", sa.Integer(), nullable=False, server_default="0"))
    op.execute(
        """
        UPDATE products p
        SET stock = COALESCE(
            (SELECT count(*) FROM pieces WHERE product_id = p.id AND state = 'available'), 0
        )
        """
    )
    op.alter_column("products", "stock", server_default=None)

    op.drop_index(op.f("ix_pieces_variant_id"), table_name="pieces")
    op.drop_index("ix_pieces_product_state", table_name="pieces")
    op.drop_index(op.f("ix_pieces_product_id"), table_name="pieces")
    op.drop_table("pieces")

    op.drop_index(op.f("ix_product_variants_sku"), table_name="product_variants")
    op.drop_index(op.f("ix_product_variants_product_id"), table_name="product_variants")
    op.drop_table("product_variants")

    op.drop_column("product_media", "is_process_footage")
    op.drop_constraint("ck_workshop_has_lead_time", "products", type_="check")
    op.drop_index(op.f("ix_products_kind"), table_name="products")
    for column in (
        "business_boost",
        "price_max",
        "lead_time_days",
        "show_piece_numbers",
        "batch_closed",
        "made_on",
        "story_ar",
        "story_en",
        "kind",
    ):
        op.drop_column("products", column)

    bind = op.get_bind()
    signal_type.drop(bind, checkfirst=True)
    piece_state.drop(bind, checkfirst=True)
    product_kind.drop(bind, checkfirst=True)
