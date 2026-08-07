"""Drop the in-app notification inbox.

The table came over from notification-service and never received a row here.
It is keyed on `user_id`, so it could only ever hold something for a signed-in
customer — and in this shop nobody is ever a signed-in customer. Buying never
requires an account, the storefront offers no way to make one, and every order
is taken against a phone number. `customer_id` has been null on all of them.

Email is what actually reaches a customer, and that path is untouched.

Revision ID: c4b7a1d90e33
Revises: 3a77cf8ceb8c
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c4b7a1d90e33"
down_revision: str | None = "3a77cf8ceb8c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(op.f("ix_notifications_user_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_created_at"), table_name="notifications")
    op.drop_table("notifications")


def downgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column("kind", sa.String(length=60), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_notifications_created_at"), "notifications", ["created_at"], unique=False
    )
    op.create_index(op.f("ix_notifications_user_id"), "notifications", ["user_id"], unique=False)
