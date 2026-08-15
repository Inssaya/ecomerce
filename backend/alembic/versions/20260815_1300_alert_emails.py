"""Move the security-alert recipients out of source and into shop_settings.

Replaces `security/service.py`'s hardcoded `ALERT_RECIPIENTS` — two personal
email addresses committed to source, one of them the owner's own — with an
admin-editable column. Seeded with the two addresses the code already used,
so upgrading changes nothing about who gets alerted until the owner changes
it from the console.

Revision ID: c2e5b8a71f04
Revises: b91f6a3c58e2
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c2e5b8a71f04"
down_revision = "b91f6a3c58e2"
branch_labels = None
depends_on = None

SETTINGS_ID = "shop"
#: What `ALERT_RECIPIENTS` in security/service.py held before this migration.
DEFAULT_ALERT_EMAILS = "yassinsinif4@gmail.com,Yassine.Sinif@emsi-edu.ma"


def upgrade() -> None:
    op.add_column(
        "shop_settings", sa.Column("alert_emails", sa.Text(), nullable=False, server_default="")
    )
    op.execute(
        sa.text("UPDATE shop_settings SET alert_emails = :emails WHERE id = :id").bindparams(
            emails=DEFAULT_ALERT_EMAILS, id=SETTINGS_ID
        )
    )


def downgrade() -> None:
    op.drop_column("shop_settings", "alert_emails")
