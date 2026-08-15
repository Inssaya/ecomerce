"""Shop settings — a contact email and phone the owner can edit.

Replaces four independent hardcoded copies of the same values across the
frontend (`workshop@mostyle.ma` twice, `mostyle.service@gmail.com` once, one
phone number) with one row the console writes to and the storefront reads.

Seeded from `Settings.smtp_from` (the existing env-configured shop email) so
an upgrade never leaves the row empty — the API refuses to serve a blank
contact email or phone to the storefront.

Revision ID: b91f6a3c58e2
Revises: a3b7e2c95d81
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "b91f6a3c58e2"
down_revision = "a3b7e2c95d81"
branch_labels = None
depends_on = None

SETTINGS_ID = "shop"
#: Matches `Settings.smtp_from`'s default in `app/config.py` — the value this
#: shop has actually been using, not a placeholder.
DEFAULT_EMAIL = "workshop@mostyle.ma"
DEFAULT_PHONE = "0623842535"


def upgrade() -> None:
    op.create_table(
        "shop_settings",
        sa.Column("id", sa.String(length=8), nullable=False),
        sa.Column("contact_email", sa.String(length=255), nullable=False),
        sa.Column("contact_phone", sa.String(length=30), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name="pk_shop_settings"),
    )
    op.execute(
        sa.text(
            "INSERT INTO shop_settings (id, contact_email, contact_phone) "
            "VALUES (:id, :email, :phone)"
        ).bindparams(id=SETTINGS_ID, email=DEFAULT_EMAIL, phone=DEFAULT_PHONE)
    )


def downgrade() -> None:
    op.drop_table("shop_settings")
