"""The two assistants.

The model itself is stubbed. What is worth testing is everything around it: that
the tools return true data, that a tool cannot be tricked into overselling, that
the loop terminates, that results are trimmed rather than truncated into
nonsense, and that with no API key the whole thing says so instead of guessing.
"""
from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

from app.core import agent, llm
from tests.test_shop_flow import shelf_piece, workshop_piece

VISITOR = {"X-Visitor-Id": "visitor-alice"}


def as_tool_call(name: str, arguments: dict, call_id: str = "call-1") -> dict:
    return {
        "id": call_id,
        "type": "function",
        "function": {"name": name, "arguments": json.dumps(arguments)},
    }


@pytest.fixture
def model(monkeypatch: pytest.MonkeyPatch):
    """A scripted model: hand it a list of replies and it returns them in
    order, recording what it was sent."""

    class Script:
        def __init__(self) -> None:
            self.replies: list[dict] = []
            self.requests: list[dict] = []

        def says(self, *replies: dict) -> None:
            self.replies = list(replies)

        async def chat(self, messages, *, tools=None, temperature=0.3, max_tokens=900):
            self.requests.append({"messages": list(messages), "tools": tools})
            return self.replies.pop(0) if self.replies else {"content": "…"}

    script = Script()
    monkeypatch.setattr(llm, "is_configured", lambda: True)
    monkeypatch.setattr(llm, "chat", script.chat)
    monkeypatch.setattr("app.core.agent.llm.is_configured", lambda: True)
    monkeypatch.setattr("app.core.agent.llm.chat", script.chat)
    return script


# ── The loop ──────────────────────────────────────────────────────────────────


def test_results_are_trimmed_structurally_not_truncated() -> None:
    """Slicing the serialized string would hand the model malformed JSON to
    guess around."""
    big = {"rows": [{"title": f"Piece {i}", "empty": None, "blank": ""} for i in range(200)]}
    serialized = agent.serialize_result(big)

    assert len(serialized) <= agent.MAX_RESULT_CHARS
    parsed = json.loads(serialized)  # still valid JSON
    assert "omitted" in parsed["rows"][-1]
    # Empty fields are dropped rather than shipped.
    assert "empty" not in parsed["rows"][0]
    assert "blank" not in parsed["rows"][0]


async def test_the_system_prompt_stays_byte_identical_between_turns(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """Providers cache the longest common prefix. Anything varying inside the
    system prompt silently doubles the cost of every message."""
    model.says({"content": "one"}, {"content": "two"})
    for text in ("hello", "again"):
        await client.post(
            "/api/assistant",
            headers=VISITOR,
            json={"messages": [{"role": "user", "content": text}]},
        )

    first, second = model.requests[0]["messages"][0], model.requests[1]["messages"][0]
    assert first["content"] == second["content"]
    # The volatile part goes last, after the history — never inside the prefix.
    assert model.requests[0]["messages"][-1]["role"] == "system"


async def test_the_same_tool_call_is_not_paid_for_twice(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    piece = await shelf_piece(client, owner_headers)
    model.says(
        {"content": None, "tool_calls": [as_tool_call("get_product", {"slug": piece["slug"]}, "a")]},
        {"content": None, "tool_calls": [as_tool_call("get_product", {"slug": piece["slug"]}, "b")]},
        {"content": "It is 180 dirhams."},
    )
    response = await client.post(
        "/api/assistant", headers=VISITOR, json={"messages": [{"role": "user", "content": "how much?"}]}
    )
    assert response.status_code == 200

    second_result = model.requests[2]["messages"][-1]["content"]
    assert "Already answered" in second_result


async def test_the_loop_always_ends(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """A model that keeps asking for tools must still produce an answer."""
    piece = await shelf_piece(client, owner_headers)
    call = {"content": None, "tool_calls": [as_tool_call("search_products", {"query": "x"})]}
    model.says(call, call, call, call, call)

    response = await client.post(
        "/api/assistant", headers=VISITOR, json={"messages": [{"role": "user", "content": "hm"}]}
    )
    assert response.status_code == 200
    assert response.json()["reply"]
    # The final round is offered without tools, so the model must conclude.
    assert model.requests[-1]["tools"] is None
    assert piece  # the catalogue existed throughout


async def test_a_malformed_tool_call_does_not_break_the_conversation(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    model.says(
        {
            "content": None,
            "tool_calls": [
                {
                    "id": "a",
                    "type": "function",
                    "function": {"name": "get_product", "arguments": "{not json"},
                }
            ],
        },
        {"content": "I could not find that one."},
    )
    response = await client.post(
        "/api/assistant", headers=VISITOR, json={"messages": [{"role": "user", "content": "?"}]}
    )
    assert response.status_code == 200
    assert response.json()["reply"] == "I could not find that one."


async def test_an_unknown_tool_comes_back_as_data_not_a_crash(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    model.says(
        {"content": None, "tool_calls": [as_tool_call("delete_everything", {})]},
        {"content": "I can't do that."},
    )
    response = await client.post(
        "/api/assistant", headers=VISITOR, json={"messages": [{"role": "user", "content": "?"}]}
    )
    assert response.status_code == 200
    assert "Unknown tool" in model.requests[1]["messages"][-1]["content"]


# ── The buyer's assistant ─────────────────────────────────────────────────────


async def test_without_an_api_key_it_says_so_instead_of_guessing(
    client: AsyncClient,
) -> None:
    status = await client.get("/api/assistant/status")
    assert status.json()["available"] is False

    response = await client.post(
        "/api/assistant", headers=VISITOR, json={"messages": [{"role": "user", "content": "hi"}]}
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "not_configured"


async def test_it_cannot_sell_more_than_was_made(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """The assistant is not trusted with availability: the tool checks."""
    piece = await shelf_piece(client, owner_headers, made=2)
    model.says(
        {
            "content": None,
            "tool_calls": [as_tool_call("add_to_cart", {"product_id": piece["id"], "quantity": 5})],
        },
        {"content": "We only have two."},
    )
    response = await client.post(
        "/api/assistant",
        headers=VISITOR,
        json={"messages": [{"role": "user", "content": "five please"}]},
    )
    assert response.status_code == 200
    assert "we made that many" in model.requests[1]["messages"][-1]["content"]
    # Nothing went to the browser, because nothing was added.
    assert response.json()["actions"] == []


async def test_adding_to_the_cart_is_an_instruction_to_the_browser(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """The cart lives on the visitor's phone. The server validates, the client
    carries it out."""
    piece = await shelf_piece(client, owner_headers, made=3)
    model.says(
        {
            "content": None,
            "tool_calls": [as_tool_call("add_to_cart", {"product_id": piece["id"], "quantity": 2})],
        },
        {"content": "Added — two of them."},
    )
    response = await client.post(
        "/api/assistant",
        headers=VISITOR,
        json={"messages": [{"role": "user", "content": "two please"}]},
    )
    actions = response.json()["actions"]
    assert actions == [
        {
            "type": "add_to_cart",
            "product_id": piece["id"],
            "slug": piece["slug"],
            "variant_id": None,
            "quantity": 2,
        }
    ]


async def test_there_is_no_tool_that_places_an_order(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """An assistant that commits someone to a cash payment at their door is a
    refused package waiting to happen. It hands over to checkout instead."""
    model.says({"content": "Ready when you are."})
    await client.post(
        "/api/assistant", headers=VISITOR, json={"messages": [{"role": "user", "content": "order it"}]}
    )
    offered = {tool["function"]["name"] for tool in model.requests[0]["tools"]}
    assert "place_order" not in offered
    assert "go_to_checkout" in offered


async def test_it_reports_real_availability_and_real_lead_times(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    shelf = await shelf_piece(client, owner_headers, made=3)
    made_to_order = await workshop_piece(client, owner_headers, lead_time=6)
    model.says(
        {"content": None, "tool_calls": [as_tool_call("search_products", {"query": ""}, "a")]},
        {"content": "Here is what we have."},
    )
    await client.post(
        "/api/assistant",
        headers=VISITOR,
        json={"messages": [{"role": "user", "content": "what do you have?"}]},
    )
    result = json.loads(model.requests[1]["messages"][-1]["content"])
    by_slug = {product["slug"]: product for product in result["products"]}

    assert by_slug[shelf["slug"]]["available"] == 3
    # Not zero — zero would read as sold out, and it means the opposite.
    assert "available" not in by_slug[made_to_order["slug"]]
    assert by_slug[made_to_order["slug"]]["ready_in_days"] == 6


async def test_a_dead_end_becomes_a_lead(
    client: AsyncClient, owner_headers: dict[str, str], model, db_session
) -> None:
    """"If we cannot find it, we make it" — the standout feature."""
    from sqlalchemy import select

    from app.models import CustomRequest

    model.says(
        {
            "content": None,
            "tool_calls": [
                as_tool_call(
                    "request_custom_item",
                    {
                        "description": "A bracket for a curved wall, matte black, 20cm.",
                        "full_name": "Salma B.",
                        "phone": "0612345678",
                    },
                )
            ],
        },
        {"content": "We can make that."},
    )
    response = await client.post(
        "/api/assistant",
        headers=VISITOR,
        json={"messages": [{"role": "user", "content": "do you have a curved bracket?"}]},
    )
    assert response.status_code == 200

    request = await db_session.scalar(select(CustomRequest))
    assert request is not None
    assert request.source == "assistant"
    assert request.customer_phone == "0612345678"


async def test_a_bad_phone_number_comes_back_as_something_to_ask_again(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    model.says(
        {
            "content": None,
            "tool_calls": [
                as_tool_call(
                    "request_custom_item",
                    {"description": "A curved bracket, 20cm", "full_name": "Salma", "phone": "123"},
                )
            ],
        },
        {"content": "What is the best number to reach you on?"},
    )
    await client.post(
        "/api/assistant", headers=VISITOR, json={"messages": [{"role": "user", "content": "make me one"}]}
    )
    assert "Ask them again" in model.requests[1]["messages"][-1]["content"]


async def test_a_search_through_the_assistant_is_recorded_as_intent(
    client: AsyncClient, owner_headers: dict[str, str], model, db_session
) -> None:
    """The most direct answer the owner has to "what are people asking us for
    that we do not make"."""
    from sqlalchemy import select

    from app.models import Signal, SignalType

    await shelf_piece(client, owner_headers)
    model.says(
        {"content": None, "tool_calls": [as_tool_call("search_products", {"query": "brass lamp"})]},
        {"content": "We don't have one."},
    )
    await client.post(
        "/api/assistant",
        headers=VISITOR,
        json={"messages": [{"role": "user", "content": "brass lamp?"}]},
    )
    signal = await db_session.scalar(select(Signal).where(Signal.type == SignalType.search))
    assert signal is not None
    assert signal.query == "brass lamp"


# ── The owner's copilot ───────────────────────────────────────────────────────


async def test_the_copilot_is_the_owners_alone(client: AsyncClient, model) -> None:
    response = await client.post(
        "/api/admin/copilot", json={"messages": [{"role": "user", "content": "how are we doing?"}]}
    )
    assert response.status_code == 401


async def test_the_copilot_and_the_panel_read_the_same_numbers(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """An owner who catches the assistant contradicting the dashboard will
    stop trusting both."""
    model.says(
        {"content": None, "tool_calls": [as_tool_call("get_pulse", {})]},
        {"content": "Quiet today."},
    )
    await client.post(
        "/api/admin/copilot",
        headers=owner_headers,
        json={"messages": [{"role": "user", "content": "how is today?"}]},
    )
    from_tool = json.loads(model.requests[1]["messages"][-1]["content"])
    from_panel = (await client.get("/api/admin/pulse", headers=owner_headers)).json()

    assert from_tool["orders_today"] == from_panel["orders_today"]
    assert from_tool["open_orders"] == from_panel["open_orders"]


async def test_the_copilot_can_explain_a_number_not_just_state_it(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """The panel should make the owner better at running the business."""
    model.says(
        {"content": None, "tool_calls": [as_tool_call("explain_kpi", {"name": "refusal_rate"})]},
        {"content": "It is the packages that came back."},
    )
    await client.post(
        "/api/admin/copilot",
        headers=owner_headers,
        json={"messages": [{"role": "user", "content": "what is the refusal rate?"}]},
    )
    explanation = json.loads(model.requests[1]["messages"][-1]["content"])["explanation"]
    assert "refused" in explanation.lower()
    assert "8" in explanation  # the target is stated, not implied


async def test_the_copilot_answers_what_should_i_make_next(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    await client.post(
        "/api/requests",
        json={
            "full_name": "Salma B.",
            "phone": "0612345678",
            "description": "A replacement knob for a 1970s radio dial.",
        },
    )
    model.says(
        {"content": None, "tool_calls": [as_tool_call("what_to_make_next", {})]},
        {"content": "Somebody wants a radio knob."},
    )
    await client.post(
        "/api/admin/copilot",
        headers=owner_headers,
        json={"messages": [{"role": "user", "content": "what should I make next?"}]},
    )
    result = json.loads(model.requests[1]["messages"][-1]["content"])
    assert any("radio dial" in text for text in result["people_asked_us_to_make"])


# ── Somebody else's order ─────────────────────────────────────────────────────


async def _an_order(client: AsyncClient, owner_headers: dict[str, str]) -> dict:
    piece = await shelf_piece(client, owner_headers, made=2)
    placed = await client.post(
        "/api/orders",
        json={
            "full_name": "Youssef A.",
            "phone": "0612345678",
            "address": {"line1": "12 Rue des Oliviers", "city": "Casablanca"},
            "items": [{"product_id": piece["id"], "quantity": 1}],
        },
    )
    assert placed.status_code == 201, placed.text
    return placed.json()


async def _tracked(client: AsyncClient, model, arguments: dict) -> str:
    model.says(
        {"content": None, "tool_calls": [as_tool_call("track_order", arguments)]},
        {"content": "Here you go."},
    )
    response = await client.post(
        "/api/assistant",
        headers=VISITOR,
        json={"messages": [{"role": "user", "content": "where is my order"}]},
    )
    assert response.status_code == 200
    # What the tool handed back to the model, which is the only thing that can
    # reach the person asking.
    return model.requests[1]["messages"][-1]["content"]


async def test_a_reference_alone_will_not_open_somebody_elses_order(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """The reference is eight characters designed to be read aloud over the
    phone and printed on a label. It is not a secret, and the front door knows
    it: `/orders/find` demands the phone number too. This used to hand back the
    status, the total and the date to anyone who typed a reference."""
    order = await _an_order(client, owner_headers)
    result = await _tracked(client, model, {"reference_or_token": order["reference"]})

    assert "phone" in result, "it must ask for the second factor"
    # None of the order came back: not the money, not the state, not the date.
    assert str(order["total"]) not in result
    assert '"status"' not in result
    assert order["reference"] not in result


async def test_the_reference_and_the_phone_together_do_open_it(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    order = await _an_order(client, owner_headers)
    result = await _tracked(
        client, model, {"reference_or_token": order["reference"], "phone": "0612345678"}
    )
    assert order["reference"] in result
    assert '"status":"placed"' in result.replace(" ", "")


async def test_the_wrong_phone_is_refused_the_same_way_as_a_wrong_reference(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """One message for both, so this cannot be used to find out which
    references exist."""
    order = await _an_order(client, owner_headers)
    wrong_phone = await _tracked(
        client, model, {"reference_or_token": order["reference"], "phone": "0600000000"}
    )
    wrong_reference = await _tracked(
        client, model, {"reference_or_token": "AAAAAAAA", "phone": "0612345678"}
    )
    assert wrong_phone == wrong_reference


async def test_the_tracking_token_stands_on_its_own(
    client: AsyncClient, owner_headers: dict[str, str], model
) -> None:
    """Forty characters from the link we emailed them. Nobody guesses that, and
    asking for a phone number on top of it would be theatre."""
    order = await _an_order(client, owner_headers)
    result = await _tracked(client, model, {"reference_or_token": order["tracking_token"]})
    assert order["reference"] in result
