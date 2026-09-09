"""Store media URLs as paths, not as absolute URLs on one hardcoded host.

Every image the shop has ever stored was written as
`http://localhost:3000/media/…`, because that is what `MINIO_PUBLIC_ENDPOINT`
happened to say when the row was created. The web server proxies `/media/*`
to MinIO on whatever host the visitor is on, so the hostname in the database
was never load-bearing — it was only ever a way for the URL to be wrong.

And it was wrong the moment the shop was opened from anywhere except the
machine running it: on a phone on the same network, or on the real domain,
`http://localhost:3000` resolves to the *visitor's own* device, so not one
image on the site loaded. Not a product photo, not an avatar, not the preview
of a reference photo somebody had just uploaded — which reads exactly like an
upload that silently failed.

Rewriting them to `/media/…` makes them correct on every host at once, and
means moving to the production domain needs no data change at all.

Only the prefix moves; the object path is untouched, so `delete_object` (which
splits on `/media/`) keeps working on old and new rows alike.

Revision ID: c7d2b91a4e58
Revises: d84f1a6e9c37
"""
from __future__ import annotations

from alembic import op

revision = "c7d2b91a4e58"
down_revision = "d84f1a6e9c37"
branch_labels = None
depends_on = None

#: Every column that has ever held one of these URLs.
TEXT_COLUMNS = (
    ("product_media", "url"),
    ("categories", "icon_url"),
    ("order_items", "image_url"),
    ("pieces", "photo_url"),
    ("users", "avatar_url"),
)

#: Matches any scheme and host in front of `/media/`, rather than only
#: `http://localhost:3000` — a database seeded or restored elsewhere carries
#: whatever host *that* machine was configured with, and all of them are
#: equally wrong.
_ABSOLUTE = r"^https?://[^/]+(/media/)"


def upgrade() -> None:
    for table, column in TEXT_COLUMNS:
        op.execute(
            f"""
            UPDATE {table}
               SET {column} = regexp_replace({column}, '{_ABSOLUTE}', '\\1')
             WHERE {column} ~ '{_ABSOLUTE}'
            """
        )

    # `custom_requests.references` is a jsonb array of URL strings. Rewriting
    # it as text and casting back is safe here because the values are URLs —
    # no embedded quotes or escapes to survive.
    op.execute(
        f"""
        UPDATE custom_requests
           SET "references" = regexp_replace(
                   "references"::text, '(https?://[^/"]+)(/media/)', '\\2', 'g'
               )::jsonb
         WHERE "references"::text ~ '(https?://[^/"]+)(/media/)'
        """
    )


def downgrade() -> None:
    """Deliberately not reversible.

    Putting a hostname back means inventing one, and the only honest candidate
    is whatever this machine is configured with today — which is precisely the
    value that made these rows wrong in the first place. The relative form is
    correct everywhere, so there is nothing to restore.
    """
