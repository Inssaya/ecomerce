"""Remember where a customer lives.

Signing in bought a shopper nothing at the till: checkout asked for the name,
the phone, the city and the street again every single time, of someone the shop
already had all four for. The reason it did is in the checkout page's own
comment — "every field removed from this screen is a sale that does not get
abandoned on it" — which was written about guests, and then applied to everyone.

So the account carries the address now. An order still copies it into its own
JSON column at the moment it is placed: an order is a record of what was agreed
that day, and someone moving house must not silently rewrite where last month's
parcel went.

Both nullable. Every account that exists predates this and has neither, and a
guest checkout never creates an account at all.

Revision ID: a71c9e2d5b48
Revises: b8d4f612a930
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "a71c9e2d5b48"
down_revision = "b8d4f612a930"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("address_line1", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "city")
    op.drop_column("users", "address_line1")
