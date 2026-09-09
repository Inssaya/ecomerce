"""The two random strings the shop mints for itself.

This file used to hold password hashing and JWT issue/verify as well. All of
that went to Supabase, which now holds the password, signs the tokens and
rotates the sessions; `app/core/supabase_auth.py` is the verifying half that
replaced it, and the working originals are kept in `archive/own-auth/`.

What is left is not identity at all. A tracking token and an order reference
are names for a *thing*, not credentials for a person — which is why they
never belonged with the passwords in the first place.
"""
from __future__ import annotations

import secrets


def new_tracking_token() -> str:
    """The credential on a tracking link.

    Long and random precisely so the tracking page needs no login: nobody
    should have to make an account to find out where their package is.
    """
    return secrets.token_urlsafe(32)


def new_order_reference() -> str:
    """Short, unambiguous, readable over the phone — the customer reads this
    back to the workshop, so no characters that sound or look alike."""
    alphabet = "ACDEFGHJKLMNPQRTUVWXY3479"
    return "".join(secrets.choice(alphabet) for _ in range(8))
