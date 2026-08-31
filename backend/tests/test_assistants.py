"""The owner's copilot.

The buyer-facing shopping concierge has been removed; this file now covers
the copilot alone, plus the one piece of the agent loop
(`agent.serialize_result`) that is tested directly rather than through an
HTTP endpoint. The model itself is stubbed. What is worth testing is
everything around it: that the copilot's tools return true data, and that
results are trimmed rather than truncated into nonsense.
"""
from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

from app.core import agent, llm


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
