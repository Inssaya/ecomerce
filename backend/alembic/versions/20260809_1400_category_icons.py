"""A small mark on each category, for the desktop rail.

Revision ID: b8d4f612a930
Revises: f2a9d16c4e77
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "b8d4f612a930"
down_revision = "f2a9d16c4e77"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("icon_url", sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column("categories", "icon_url")
