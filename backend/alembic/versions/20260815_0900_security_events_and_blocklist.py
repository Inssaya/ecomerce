"""What the shop noticed, and who it has stopped answering.

Two tables, basic on purpose — the owner asked for logs, not a SIEM.

* **`security_events`** — one row per notable thing: a rate limit tripped, a
  flood of requests from one place. Read close to raw by the console's Logs
  door; a `danger` row is what triggers the email alert.
* **`blocklist`** — one row blocks one thing, a fingerprint or an address,
  never both in the same row. They have different lifetimes: a fingerprint
  block holds until someone lifts it, an IP block always carries a 24-hour
  expiry because an address can be a whole café.

Revision ID: e6f184a9b7d0
Revises: f6923ea18b24
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "e6f184a9b7d0"
down_revision = "f6923ea18b24"
branch_labels = None
depends_on = None

_LEVEL_VALUES = ("info", "warn", "danger")

security_level = sa.Enum(*_LEVEL_VALUES, name="security_level")
level_col = postgresql.ENUM(*_LEVEL_VALUES, name="security_level", create_type=False)


def upgrade() -> None:
    security_level.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "security_events",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("level", level_col, nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("visitor_id", sa.String(length=80), nullable=True),
        sa.Column("user_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_events_level", "security_events", ["level"])
    op.create_index("ix_security_events_visitor_id", "security_events", ["visitor_id"])
    op.create_index("ix_security_events_recent", "security_events", ["created_at"])
    op.create_index(
        "ix_security_events_level_recent", "security_events", ["level", "created_at"]
    )

    op.create_table(
        "blocklist",
        sa.Column("id", sa.UUID(as_uuid=False), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("visitor_id", sa.String(length=80), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint("ip IS NOT NULL OR visitor_id IS NOT NULL", name="ck_blocklist_target"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_blocklist_ip", "blocklist", ["ip"])
    op.create_index("ix_blocklist_visitor", "blocklist", ["visitor_id"])

    op.alter_column("blocklist", "active", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_blocklist_visitor", table_name="blocklist")
    op.drop_index("ix_blocklist_ip", table_name="blocklist")
    op.drop_table("blocklist")

    op.drop_index("ix_security_events_level_recent", table_name="security_events")
    op.drop_index("ix_security_events_recent", table_name="security_events")
    op.drop_index("ix_security_events_visitor_id", table_name="security_events")
    op.drop_index("ix_security_events_level", table_name="security_events")
    op.drop_table("security_events")

    security_level.drop(op.get_bind(), checkfirst=True)
