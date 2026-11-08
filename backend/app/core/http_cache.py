"""Cache headers for the public, read-only pages of the shop.

The storefront proxies `/api/*` through Vercel, whose CDN will answer repeat
requests itself when the response says it may. For the catalogue that is the
difference between one database round trip per visitor and one per minute for
everybody: the same shelf, the same product, the same city page is asked for
over and over, and nothing in the answer depends on who is asking.

Only ever call this on a route whose response is identical for every visitor.
Nothing that reads the visitor cookie, the session, or an order belongs here.
"""
from __future__ import annotations

from fastapi import Response


def public_cache(response: Response, seconds: int = 60) -> None:
    """Let a shared cache keep this answer for `seconds`.

    `stale-while-revalidate` is the part that matters on a host that sleeps when
    idle: for ten minutes after the answer expires the CDN keeps serving the old
    one instantly while it fetches a fresh copy in the background, so a visitor
    never waits on a cold start.

    `s-maxage` only, no `max-age`: browsers should not hold on to it, so an
    edit made in the console shows up on the next load rather than the next
    hour.
    """
    response.headers["Cache-Control"] = (
        f"public, s-maxage={seconds}, stale-while-revalidate=600"
    )
