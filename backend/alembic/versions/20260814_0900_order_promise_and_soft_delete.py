"""A date the countdown counts to, and a way back after "Delete".

Two things the order door needed that had nowhere to live:

* **`orders.promised_for`** — the date shown as a countdown on the order and
  the customer's tracking page. Defaulted at checkout from the items' delivery
  promise, editable afterwards, because a date decided on day one sometimes
  has to move and the customer should see the number that is still true.
* **`hidden_at`** on both `orders` and `custom_requests` — soft-delete. An
  order is an accounting record and a request is a lead; neither should
  actually disappear when the owner presses "Delete" in a queue. Both columns
  are nullable and both are ignored by every customer-facing endpoint — a
  hidden order still has to track for the person waiting on it.

Revision ID: f6923ea18b24
Revises: e58b2d0f7a13
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "f6923ea18b24"
down_revision = "e58b2d0f7a13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("promised_for", sa.Date(), nullable=True))
    op.add_column("orders", sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "custom_requests", sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("custom_requests", "hidden_at")
    op.drop_column("orders", "hidden_at")
    op.drop_column("orders", "promised_for")
