"""The shop states no time, to anyone.

No lead time, no delivery estimate, no countdown — the columns are dropped
rather than hidden, because a column that exists is a column something will
eventually print. When a buyer needs to know when their thing arrives, the
workshop tells them on the phone.

Dropped:

* `products.lead_time_days` and `products.delivery_days`
* `order_items.lead_time_days`
* `orders.promised_for` — the countdown's target date
* `custom_requests.lead_time_days` and `custom_requests.promised_for`
* `ck_workshop_has_lead_time`, which tied made-to-order pieces to a lead time
  that no longer exists

The downgrade puts the columns back empty. It cannot put the values back —
they are dropped with the columns — so an order that had a promised date
returns without one. Nothing reads them any more either way.

Revision ID: a3b7e2c95d81
Revises: c71d4a0e8f52
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "a3b7e2c95d81"
down_revision = "c71d4a0e8f52"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The constraint first: it references the column that is about to go.
    op.drop_constraint("ck_workshop_has_lead_time", "products", type_="check")

    op.drop_column("products", "lead_time_days")
    op.drop_column("products", "delivery_days")
    op.drop_column("order_items", "lead_time_days")
    op.drop_column("orders", "promised_for")
    op.drop_column("custom_requests", "lead_time_days")
    op.drop_column("custom_requests", "promised_for")


def downgrade() -> None:
    op.add_column("custom_requests", sa.Column("promised_for", sa.Date(), nullable=True))
    op.add_column("custom_requests", sa.Column("lead_time_days", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("promised_for", sa.Date(), nullable=True))
    op.add_column("order_items", sa.Column("lead_time_days", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("delivery_days", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("lead_time_days", sa.Integer(), nullable=True))
    # Restored as it was: workshop pieces must declare a lead time. Every row
    # comes back null, so the constraint can only hold once they are filled in
    # — it is created NOT VALID and left for whoever needs it to enforce.
    op.execute(
        "ALTER TABLE products ADD CONSTRAINT ck_workshop_has_lead_time "
        "CHECK (kind <> 'workshop' OR lead_time_days IS NOT NULL) NOT VALID"
    )
