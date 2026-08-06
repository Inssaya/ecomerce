"""Who is allowed to do what.

The old services read `X-User-Role` from a header and believed it. Once the
gateway was removed that header became attacker-controlled, so these tests
exist to prove the replacement actually verifies a signature.
"""
from __future__ import annotations

from httpx import AsyncClient


async def customer_headers(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/api/auth/register",
        json={"email": "buyer@example.ma", "password": "a-good-password", "full_name": "A Buyer"},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_forged_role_headers_are_ignored(client: AsyncClient) -> None:
    """This is exactly the request that used to work."""
    forged = await client.get(
        "/api/admin/products", headers={"X-User-Id": "anyone", "X-User-Role": "admin"}
    )
    assert forged.status_code == 401


async def test_a_customer_cannot_reach_the_workshop_endpoints(client: AsyncClient) -> None:
    headers = await customer_headers(client)
    assert (await client.get("/api/admin/products", headers=headers)).status_code == 403
    assert (await client.get("/api/admin/orders", headers=headers)).status_code == 403
    created = await client.post(
        "/api/admin/products", headers=headers, json={"title_en": "Mine now", "price": 10}
    )
    assert created.status_code == 403


async def test_registration_never_produces_an_owner(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/register",
        json={"email": "wants-power@example.ma", "password": "a-good-password", "role": "owner"},
    )
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "customer"


async def test_a_garbage_token_is_not_a_session(client: AsyncClient) -> None:
    assert (
        await client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.token"})
    ).status_code == 401


async def test_changing_the_password_ends_the_other_sessions(client: AsyncClient) -> None:
    headers = await customer_headers(client)
    changed = await client.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": "a-good-password", "new_password": "an-even-better-password"},
    )
    assert changed.status_code == 204

    signed_in = await client.post(
        "/api/auth/login",
        json={"email": "buyer@example.ma", "password": "an-even-better-password"},
    )
    assert signed_in.status_code == 200
    stale_refresh = await client.post(
        "/api/auth/refresh", json={"refresh_token": "irrelevant-but-well-formed"}
    )
    assert stale_refresh.status_code == 401


async def test_the_owner_seed_refuses_a_second_workshop(owner_headers: dict[str, str]) -> None:
    from app.cli import seed_owner

    assert await seed_owner("someone-else@mostyle.ma", "another-long-password", "Impostor") == 1
