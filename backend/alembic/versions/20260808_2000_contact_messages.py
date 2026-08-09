"""Somewhere a contact-form message actually lands.

Revision ID: f2a9d16c4e77
Revises: e1f4c8a72b06
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "f2a9d16c4e77"
down_revision = "e1f4c8a72b06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_contact_messages_created_at"), "contact_messages", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_contact_messages_created_at"), table_name="contact_messages")
    op.drop_table("contact_messages")
