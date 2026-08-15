"""Let an order line exist without a catalogue product behind it.

Every custom request was creating an order with **no line items at all**. The
chain: `requests/service.approve()` built its `OrderItem` only
`if request.product_id`, and a custom request never has one — it starts from
the customer's own idea, not from something in the catalogue. So the branch
never ran, and the shop filed orders reading `total = 260` with nothing sold
in them. The admin popup opened them empty; an invoice would have printed
blank.

The condition could not simply be deleted, because `order_items.product_id`
was `NOT NULL`. This is that constraint, relaxed. A custom line legitimately
points at no product and carries the description and agreed price instead.

The foreign key and its `RESTRICT` are untouched: a *store* line still points
at a real product and still cannot have that product deleted out from under
it. An order is an accounting record and has to stay reconstructable.

Revision ID: c71d4a0e8f52
Revises: e6f184a9b7d0
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "c71d4a0e8f52"
down_revision = "e6f184a9b7d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "order_items",
        "product_id",
        existing_type=sa.UUID(as_uuid=False),
        nullable=True,
    )


def downgrade() -> None:
    # Any custom line written while this was relaxed has a null here and would
    # violate the restored constraint. They are deleted rather than silently
    # pointed at some arbitrary product — a line that names no product is
    # exactly what the old schema could not represent, so going back means
    # losing them. Nothing else can produce a null in this column.
    op.execute("DELETE FROM order_items WHERE product_id IS NULL")
    op.alter_column(
        "order_items",
        "product_id",
        existing_type=sa.UUID(as_uuid=False),
        nullable=False,
    )
