"""Hand identity to Supabase.

Supabase now holds the password, sends the confirmation and reset mail, signs
the access tokens and rotates the sessions. Two things follow for this schema:

* `users.password_hash` has nothing to store. Keeping a column that once held
  password hashes and is now permanently empty is worse than dropping it — it
  invites the next person to write to it.
* `refresh_tokens` was this application's session table: one row per live
  session, rotated on use and revoked on sign-out. Supabase keeps its own, so
  ours is now a table that fills up and is never read.

The `users` row itself stays, and that is deliberate. Six tables point at it —
orders, custom requests, signals, product interactions and the security log —
and an order must keep pointing at whoever placed it. `id` becomes the
Supabase user id, and the row is created on that account's first
authenticated request.

`role` also stays here rather than moving into Supabase metadata: who may open
the console is a decision about this business, and reading it from a dashboard
would mean whoever can edit that dashboard can grant themselves the console.

**Existing accounts cannot be carried over.** bcrypt hashes are not importable
into Supabase, so every account has to be created there and its row re-keyed to
the new id. There are two rows and one of them is a test account, so the
migration simply removes accounts that can no longer sign in and leaves the
owner to be re-linked by `python -m app.cli make-owner`. Orders keep their
history either way: `orders.customer_id` is nullable and already ON DELETE SET
NULL, so a purged account leaves guest orders rather than deleting sales.

Revision ID: b3f8c02d7a41
Revises: c7d2b91a4e58
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b3f8c02d7a41"
down_revision = "c7d2b91a4e58"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Sessions first: it is the only table with a foreign key into `users`
    # that exists purely to serve the auth we are removing.
    op.drop_table("refresh_tokens")

    # Accounts whose only credential was a bcrypt hash cannot sign in any
    # more — the hash cannot move to Supabase. Removing them is what makes
    # the id re-keying below possible without a collision, and the orders
    # they placed survive as guest orders.
    op.execute("DELETE FROM users")

    op.drop_column("users", "password_hash")


def downgrade() -> None:
    """Structure comes back; the accounts do not.

    `password_hash` is restored with an empty default so the column can be
    NOT NULL again, but no hash on earth is recoverable from here — every
    account would still have to reset its password. Said plainly rather than
    implied, because a downgrade that looks reversible and is not is how
    somebody loses a login at the worst possible moment.
    """
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(length=255), nullable=False, server_default=""),
    )
    op.alter_column("users", "password_hash", server_default=None)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)
