"""Drop the embeddings, and with them the last of the AI.

The shop's AI was one owner-only screen (a copilot that answered questions
about the figures) and one ranking term: `cosine(visitor_vector,
product_embedding)`, weighted 0.8 in the feed. Both are gone at the owner's
decision — the shop does not want them, and every dependency they carried is
weight in a deployment that has to stay small.

Nothing is lost with the data, because there never was any. `product_embeddings`
has held zero rows for its whole life: filling it needs an embedding API, no key
was ever configured, and the ranking SQL already read the term as zero for every
piece. What is being removed is a column, an index and a possibility — not a
working feature.

The `vector` extension is deliberately **left installed**. Dropping it is not
free to reverse on a managed Postgres, it costs nothing to keep, and it is the
one thing that would have to be argued for again if the shop ever wants
semantic ranking back.

Revision ID: e5a1c9f4b208
Revises: b3f8c02d7a41
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "e5a1c9f4b208"
down_revision = "b3f8c02d7a41"
branch_labels = None
depends_on = None

EMBEDDING_DIMENSIONS = 1536


def upgrade() -> None:
    op.drop_index("ix_product_embeddings_cosine", table_name="product_embeddings")
    op.drop_table("product_embeddings")


def downgrade() -> None:
    """Restores the table, which is all there is to restore.

    Re-embedding every product is an application job and a paid API call, not
    something a migration can do — so this brings back an empty table and the
    feed keeps scoring the semantic term as zero until something fills it.
    """
    import pgvector.sqlalchemy

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
    op.execute(
        "CREATE INDEX ix_product_embeddings_cosine ON product_embeddings "
        "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)"
    )
