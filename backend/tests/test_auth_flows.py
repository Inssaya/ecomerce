"""Getting in, staying in, and getting back in.

Half of `auth/routes.py` had no test on it, which is a strange place for a
shop's coverage to be thin: it is the file that decides who is the owner. The
reset flow especially — it is the only route back into the panel if the
password is lost, it hands out a credential by email, and until this file
nothing had ever followed it end to end.

The tests are written from the outside, as a person or an attacker would meet
it: post the form, read the email, use the link.
"""
from __future__ import annotations

import re

from httpx import AsyncClient

OWNER = "workshop@mostyle.ma"
FIRST = "a-long-enough-password"
SECOND = "an-even-longer-password"


def token_from(mailbox: list[dict[str, str]]) -> str:
    """Pull the reset token out of the link, the way a customer's browser would."""
    assert mailbox, "no email was sent"
    found = re.search(r"token=([A-Za-z0-9_\-]+)", mailbox[-1]["html"])
    assert found, mailbox[-1]["html"][:400]
    return found.group(1)


async def sign_in(client: AsyncClient, password: str, email: str = OWNER):
    return await client.post("/api/auth/login", json={"email": email, "password": password})


# ── The way back in ───────────────────────────────────────────────────────────


async def test_a_lost_password_can_actually_be_reset(
    client: AsyncClient, owner_token: str, mailbox: list[dict[str, str]]
) -> None:
    """The whole path, in the order a person walks it. This is the owner's only
    route back into the panel, and nothing had ever run it before."""
    mailbox.clear()
    assert (await client.post("/api/auth/forgot-password", json={"email": OWNER})).status_code == 204

    token = token_from(mailbox)
    reset = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": SECOND}
    )
    assert reset.status_code == 204, reset.text

    assert (await sign_in(client, FIRST)).status_code == 401
    assert (await sign_in(client, SECOND)).status_code == 200


async def test_the_link_points_at_a_page_that_exists(
    client: AsyncClient, owner_token: str, mailbox: list[dict[str, str]]
) -> None:
    """This one is here because it was wrong for weeks: the email pointed at
    `/{lang}/account/reset`, which returned a 404. A test on the token alone
    would never have caught it, so this asserts the shape of the address."""
    mailbox.clear()
    await client.post("/api/auth/forgot-password", json={"email": OWNER})
    link = re.search(r'href="([^"]*account/reset[^"]*)"', mailbox[-1]["html"])
    assert link, "the reset email must link to the reset page"
    assert re.search(r"/(en|ar)/account/reset\?token=", link.group(1)), link.group(1)


async def test_a_reset_link_works_once(
    client: AsyncClient, owner_token: str, mailbox: list[dict[str, str]]
) -> None:
    """Otherwise anyone who ever sees the email — a forwarded message, a shared
    screen, a mailbox opened later — has a permanent key to the shop."""
    mailbox.clear()
    await client.post("/api/auth/forgot-password", json={"email": OWNER})
    token = token_from(mailbox)

    first = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": SECOND}
    )
    assert first.status_code == 204

    again = await client.post(
        "/api/auth/reset-password", json={"token": token, "new_password": "a-third-password"}
    )
    assert again.status_code == 400
    # And the second attempt changed nothing.
    assert (await sign_in(client, SECOND)).status_code == 200


async def test_an_invented_token_resets_nothing(client: AsyncClient, owner_token: str) -> None:
    response = await client.post(
        "/api/auth/reset-password",
        json={"token": "not-a-real-token-at-all", "new_password": SECOND},
    )
    assert response.status_code == 400
    assert (await sign_in(client, FIRST)).status_code == 200


async def test_resetting_signs_every_other_device_out(
    client: AsyncClient, owner_token: str, mailbox: list[dict[str, str]]
) -> None:
    """The usual reason to reset a password is that somebody else may have it.
    Leaving their session alive would make the reset theatre."""
    other = await sign_in(client, FIRST)
    stolen_refresh = other.json()["refresh_token"]

    mailbox.clear()
    await client.post("/api/auth/forgot-password", json={"email": OWNER})
    await client.post(
        "/api/auth/reset-password",
        json={"token": token_from(mailbox), "new_password": SECOND},
    )

    refused = await client.post("/api/auth/refresh", json={"refresh_token": stolen_refresh})
    assert refused.status_code == 401


async def test_asking_about_an_unknown_address_reveals_nothing(
    client: AsyncClient, owner_token: str, mailbox: list[dict[str, str]]
) -> None:
    """Same answer either way, and no message sent. A form that responds
    differently is a way to test which addresses are registered."""
    mailbox.clear()
    unknown = await client.post(
        "/api/auth/forgot-password", json={"email": "nobody@mostyle.ma"}
    )
    known = await client.post("/api/auth/forgot-password", json={"email": OWNER})

    assert unknown.status_code == known.status_code == 204
    assert [message["to"] for message in mailbox] == [OWNER]


async def test_a_short_password_is_refused_on_the_way_in(
    client: AsyncClient, owner_token: str, mailbox: list[dict[str, str]]
) -> None:
    """The reset form is the one place a password is chosen without anyone
    watching, so the rule has to hold here too."""
    mailbox.clear()
    await client.post("/api/auth/forgot-password", json={"email": OWNER})
    response = await client.post(
        "/api/auth/reset-password", json={"token": token_from(mailbox), "new_password": "short"}
    )
    assert response.status_code == 422
    assert (await sign_in(client, FIRST)).status_code == 200


# ── Sessions ──────────────────────────────────────────────────────────────────


async def test_a_refresh_token_is_spent_when_it_is_used(
    client: AsyncClient, owner_token: str
) -> None:
    """Rotation is what limits the damage of a leaked refresh token: it is
    good for one exchange, and a second use is somebody replaying it."""
    session = (await sign_in(client, FIRST)).json()

    rotated = await client.post(
        "/api/auth/refresh", json={"refresh_token": session["refresh_token"]}
    )
    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"] != session["refresh_token"]

    replay = await client.post(
        "/api/auth/refresh", json={"refresh_token": session["refresh_token"]}
    )
    assert replay.status_code == 401


async def test_an_access_token_cannot_be_used_to_refresh(
    client: AsyncClient, owner_token: str
) -> None:
    """They are different types for a reason — an access token travels on every
    request and is the more likely of the two to leak."""
    response = await client.post("/api/auth/refresh", json={"refresh_token": owner_token})
    assert response.status_code == 401


async def test_signing_out_ends_that_session_and_not_the_others(
    client: AsyncClient, owner_token: str
) -> None:
    phone = (await sign_in(client, FIRST)).json()
    laptop = (await sign_in(client, FIRST)).json()

    assert (
        await client.post("/api/auth/logout", json={"refresh_token": phone["refresh_token"]})
    ).status_code == 204

    assert (
        await client.post("/api/auth/refresh", json={"refresh_token": phone["refresh_token"]})
    ).status_code == 401
    assert (
        await client.post("/api/auth/refresh", json={"refresh_token": laptop["refresh_token"]})
    ).status_code == 200


async def test_signing_out_a_token_that_never_existed_says_nothing(
    client: AsyncClient, owner_token: str
) -> None:
    """204 either way. A different answer would tell someone whether a token
    they found is still live."""
    response = await client.post("/api/auth/logout", json={"refresh_token": "invented"})
    assert response.status_code == 204


# ── Changing it on purpose ────────────────────────────────────────────────────


async def test_the_current_password_is_required_to_change_it(
    client: AsyncClient, owner_headers: dict[str, str]
) -> None:
    """Otherwise a borrowed phone with the panel still open is a permanent
    takeover rather than a temporary one."""
    response = await client.post(
        "/api/auth/change-password",
        headers=owner_headers,
        json={"current_password": "not-the-password", "new_password": SECOND},
    )
    assert response.status_code in (400, 401, 403)
    assert (await sign_in(client, FIRST)).status_code == 200
