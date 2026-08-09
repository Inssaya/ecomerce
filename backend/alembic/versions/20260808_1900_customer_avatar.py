"""Give a customer a face.

The storefront now has accounts — not to buy, which still needs nothing but a
phone number, but so the concierge knows who it is talking to and so a returning
customer can see what they have bought. A profile with no picture is a row in a
table; this is the one column that makes it a person.

Nullable, with no default: most accounts will never set one, and the storefront
falls back to the initial of the name rather than to a stock silhouette.

Revision ID: e1f4c8a72b06
Revises: c4b7a1d90e33
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "e1f4c8a72b06"
down_revision = "c4b7a1d90e33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
