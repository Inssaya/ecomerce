"""what the analytics and the forecast need to exist

Three columns and three indexes, all additive and all nullable, so this
migration is safe to run against a live shop with signals already in it.

`signals.path` is the one that changes what can be asked. Until now a signal
knew *which piece* it was about but not *which screen* it happened on, so
"how far down the shelf do people get" and "what fraction of the people who
opened a piece scrolled to the story" were not questions the database could
answer at all.

Revision ID: 8b2ad4471e90
Revises: 1c57fa6ff86d
Create Date: 2026-08-06 17:20:11.204416
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "8b2ad4471e90"
down_revision: str | None = "1c57fa6ff86d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("signals", sa.Column("path", sa.String(length=60), nullable=True))
    op.create_index("ix_signals_path_recent", "signals", ["path", "created_at"], unique=False)
    # Every analytics query is "this period, grouped by something". Without
    # this each one is a sequential scan of the whole signals table, which is
    # by some distance the largest table here.
    op.create_index("ix_signals_recent", "signals", ["created_at"], unique=False)

    op.add_column(
        "custom_requests", sa.Column("category_id", sa.UUID(as_uuid=False), nullable=True)
    )
    op.create_index(
        op.f("ix_custom_requests_category_id"), "custom_requests", ["category_id"], unique=False
    )
    op.create_foreign_key(
        "fk_custom_requests_category_id",
        "custom_requests",
        "categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_custom_requests_category_id", "custom_requests", type_="foreignkey")
    op.drop_index(op.f("ix_custom_requests_category_id"), table_name="custom_requests")
    op.drop_column("custom_requests", "category_id")

    op.drop_index("ix_signals_recent", table_name="signals")
    op.drop_index("ix_signals_path_recent", table_name="signals")
    op.drop_column("signals", "path")
