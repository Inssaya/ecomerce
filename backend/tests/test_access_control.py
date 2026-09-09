"""Who is allowed to do what.

The old services read `X-User-Role` from a header and believed it. Once the
gateway was removed that header became attacker-controlled, so these tests
exist to prove the replacement actually verifies a token.

Identity moved to Supabase, and that changed *who signs* the token — not who
decides what it may do. Every check below is still the shop's own: `role`
lives on the shop's `users` row, and a Supabase token that says nothing about
roles still cannot open the console. The signature check itself is stubbed in
`conftest.py`, deliberately — proving that Supabase can verify its own
signatures is Supabase's job, and reaching across the network to re-prove it
would make this suite slow and flaky. Everything downstream of that stub is
the real code path.
"""
from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import fake_token


async def test_forged_role_headers_are_ignored(client: AsyncClient) -> None:
    """This is exactly the request that used to work."""
    forged = await client.get(
        "/api/admin/products", headers={"X-User-Id": "anyone", "X-User-Role": "admin"}
    )
    assert forged.status_code == 401


async def test_a_customer_cannot_reach_the_workshop_endpoints(
    client: AsyncClient, customer_headers: dict[str, str]
) -> None:
    assert (await client.get("/api/admin/products", headers=customer_headers)).status_code == 403
    assert (await client.get("/api/admin/orders", headers=customer_headers)).status_code == 403
    created = await client.post(
        "/api/admin/products", headers=customer_headers, json={"title_en": "Mine now", "price": 10}
    )
    assert created.status_code == 403


async def test_a_new_account_is_never_the_owner(
    client: AsyncClient, customer_headers: dict[str, str]
) -> None:
    """Signing up cannot make you the workshop.

    Supabase decides who may hold an account; it has no say in who runs this
    shop. A brand-new account's first authenticated request creates its row
    here, and that row is a customer — the only way to change it is
    `python -m app.cli make-owner`, run on the machine itself.
    """
    me = await client.get("/api/auth/me", headers=customer_headers)
    assert me.status_code == 200, me.text
    assert me.json()["role"] == "customer"


async def test_a_token_this_shop_did_not_accept_is_not_a_session(client: AsyncClient) -> None:
    """A well-formed token from somewhere else buys nothing.

    The real verifier pins the issuer to this Supabase project, so a token
    minted by any *other* project fails the same way garbage does.
    """
    for token in ("not.a.token", "Bearer", "", "some-other-issuer:x:y@z.com"):
        response = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401, f"{token!r} was accepted"


async def test_the_role_comes_from_this_database_not_from_the_token(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """The claim that matters is not in the token at all.

    An owner's token is indistinguishable from a shopper's — same issuer, same
    audience, no role claim. What separates them is a column in this database,
    which is why nobody can grant themselves the console by editing a profile
    in the Supabase dashboard.
    """
    me = await client.get("/api/auth/me", headers=owner_headers)
    assert me.status_code == 200, me.text
    assert me.json()["role"] == "owner"
    assert (await client.get("/api/admin/orders", headers=owner_headers)).status_code == 200


async def test_only_one_workshop(owner_headers: dict[str, str]) -> None:
    from app.cli import make_owner

    second = await make_owner("someone-else@mostyle.ma", "00000000-0000-4000-8000-0000000000ff")
    assert second == 1


async def test_an_unknown_account_cannot_be_promoted_blind() -> None:
    """`make-owner` will not invent a row it has no id for.

    Guessing would create an account keyed by something Supabase never issued,
    which would then never match a real sign-in — an owner row nobody can log
    into, and a very quiet way to lock the workshop out.
    """
    from app.cli import make_owner

    assert await make_owner("nobody-here@mostyle.ma") == 1
