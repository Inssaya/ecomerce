"""File a message away instead of letting the inbox only grow.

Contact messages could be marked read and nothing else — no delete, no
archive. One run of spam and the unread badge is permanently meaningless, and
the owner stops trusting the one number that tells them somebody is waiting.

Archiving rather than deleting, because a message is a lead and a lead that
turned out to be nothing today may not be nothing next month.

Revision ID: c3f1a8b52d64
Revises: a71c9e2d5b48
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c3f1a8b52d64"
down_revision = "a71c9e2d5b48"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contact_messages",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("contact_messages", "archived_at")
