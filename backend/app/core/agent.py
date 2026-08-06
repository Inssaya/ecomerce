"""The agentic loop: the model reasons, calls tools, reads results, answers.

Adapted from the ANTIV project's `app/ai/agent.py`. The token discipline is
that file's and is kept for the same reason — a loop resends the entire
conversation on every round, so cost grows quadratically with rounds unless
every slice is capped:

1. **Stable prefix.** Providers cache the longest common prefix of a request.
   The system prompt is therefore a frozen constant — no dates, no counts — and
   anything volatile is appended *after* the history, so `system + tool schemas`
   stays byte-identical between requests and is served from cache.
2. **Structural trimming.** Tool results are shrunk by dropping empty fields and
   capping rows *before* serialization, never by slicing the JSON string, which
   would hand the model malformed data to guess around.
3. **No work twice.** A repeated (tool, arguments) pair returns a pointer
   instead of the payload — the data is already in context.

What changed in the move: it is async, and it is generic over a toolbox, since
this application has two assistants — one facing buyers, one facing the owner —
and they differ in their tools and their prompt, not in how the loop runs.
"""
from __future__ import annotations

import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app.core import llm

logger = logging.getLogger(__name__)

# A token budget, not an arbitrary cap. Most questions resolve in one round of
# tools; the last round is offered without them so the model must conclude.
MAX_ROUNDS = 3
MAX_RESULT_CHARS = 1500
MAX_ROWS_IN_RESULT = 10
MAX_HISTORY = 8
MAX_USER_CHARS = 1000
MAX_ASSISTANT_CHARS = 600


@dataclass(slots=True)
class ToolCall:
    """One thing the assistant did, shown back to the caller so an answer is
    always auditable — "which data did it look at?"."""

    tool: str
    arguments: dict[str, Any]
    duration_ms: int
    ok: bool


@dataclass(slots=True)
class Reply:
    text: str
    trace: list[ToolCall] = field(default_factory=list)
    #: Things for the client to carry out — opening a piece, filling a cart.
    #: The server does not have a cart; the browser does.
    actions: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class Toolbox:
    """Everything one assistant needs that the loop does not care about."""

    system_prompt: str
    specs: list[dict[str, Any]]
    run: Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]
    #: Volatile facts, appended after the history so the cached prefix is not
    #: disturbed. Returns None when there is nothing to say.
    context: Callable[[], Awaitable[str | None]] | None = None


def spec(
    name: str, description: str, properties: dict[str, Any], required: list[str] | None = None
) -> dict[str, Any]:
    """One tool schema.

    Descriptions are terse on purpose: the whole schema list is resent on every
    round and counts against the per-minute budget. Shared conventions are
    stated once in the system prompt rather than repeated on every parameter.
    """
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required or [],
            },
        },
    }


def _shrink(value: Any, rows: int) -> Any:
    """Drop empties and cap list lengths so a result serializes small and stays
    valid JSON. Slicing the serialized string instead would truncate mid-token
    and hand the model something it cannot parse."""
    if isinstance(value, dict):
        return {
            key: _shrink(item, rows)
            for key, item in value.items()
            if item is not None and item != "" and item != [] and item != {}
        }
    if isinstance(value, list):
        kept = [_shrink(item, rows) for item in value[:rows]]
        if len(value) > rows:
            kept.append(f"…{len(value) - rows} more omitted")
        return kept
    if isinstance(value, float):
        return round(value, 2)
    return value


def serialize_result(result: dict[str, Any]) -> str:
    for rows in (MAX_ROWS_IN_RESULT, 6, 3, 1):
        text = json.dumps(_shrink(result, rows), default=str, separators=(",", ":"))
        if len(text) <= MAX_RESULT_CHARS:
            return text
    return text[:MAX_RESULT_CHARS]


def _call_key(name: str, arguments: dict[str, Any]) -> str:
    return name + "|" + json.dumps(arguments, sort_keys=True, default=str)


async def run(toolbox: Toolbox, conversation: list[dict[str, str]], *, lang: str) -> Reply:
    """`conversation` is [{role, content}, ...] ending with the new message."""
    if not llm.is_configured():
        raise llm.LlmNotConfigured("The assistant is not available right now")

    # Order is deliberate: frozen system prompt first (cached along with the
    # tool schemas), then the history, then anything volatile last.
    messages: list[dict[str, Any]] = [{"role": "system", "content": toolbox.system_prompt}]
    for turn in conversation[-MAX_HISTORY:]:
        role = turn.get("role")
        if role in ("user", "assistant") and turn.get("content"):
            limit = MAX_USER_CHARS if role == "user" else MAX_ASSISTANT_CHARS
            messages.append({"role": role, "content": str(turn["content"])[:limit]})

    volatile = [f"Answer in {'Arabic' if lang == 'ar' else 'English'}."]
    if toolbox.context is not None:
        extra = await toolbox.context()
        if extra:
            volatile.append(extra)
    messages.append({"role": "system", "content": " ".join(volatile)})

    trace: list[ToolCall] = []
    actions: list[dict[str, Any]] = []
    seen: dict[str, int] = {}

    for round_number in range(MAX_ROUNDS):
        offer = toolbox.specs if round_number < MAX_ROUNDS - 1 else None
        message = await llm.chat(messages, tools=offer)

        calls = message.get("tool_calls") or []
        if not calls:
            return Reply(text=message.get("content") or "", trace=trace, actions=actions)

        # The API needs the assistant's own message echoed back before results.
        messages.append(
            {"role": "assistant", "content": message.get("content"), "tool_calls": calls}
        )
        for call in calls:
            name = call.get("function", {}).get("name", "")
            try:
                arguments = json.loads(call.get("function", {}).get("arguments") or "{}")
            except json.JSONDecodeError:
                # Models occasionally emit malformed argument JSON. An empty
                # object is safer than a crash — each tool validates anyway.
                arguments = {}

            key = _call_key(name, arguments)
            if key in seen:
                content = json.dumps(
                    {"note": f"Already answered in round {seen[key]} — reuse that result."}
                )
                elapsed, ok = 0, True
            else:
                started = time.monotonic()
                result = await toolbox.run(name, arguments)
                elapsed = int((time.monotonic() - started) * 1000)
                ok = "error" not in result
                # A tool may ask the browser to do something the server cannot.
                for action in result.pop("_actions", []):
                    actions.append(action)
                content = serialize_result(result)
                seen[key] = round_number + 1

            trace.append(ToolCall(tool=name, arguments=arguments, duration_ms=elapsed, ok=ok))
            messages.append(
                {"role": "tool", "tool_call_id": call.get("id", ""), "content": content}
            )

    logger.info("Assistant ran out of rounds after %s tool calls", len(trace))
    return Reply(
        text=(
            "لم أستطع إنهاء هذا. اسألني بشكل أوضح قليلاً."
            if lang == "ar"
            else "I couldn't finish that one — try asking a bit more specifically."
        ),
        trace=trace,
        actions=actions,
    )


async def dispatch(
    implementations: dict[str, Callable[..., Awaitable[dict[str, Any]]]],
    name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    """Run one tool. Errors come back as data so the model can recover — ask
    differently, try another tool — instead of the whole conversation failing.
    """
    function = implementations.get(name)
    if function is None:
        return {"error": f"Unknown tool '{name}'"}
    try:
        return await function(**arguments)
    except TypeError as exc:
        return {"error": f"Wrong arguments for {name}: {exc}"}
    except Exception as exc:
        logger.exception("Tool %s failed", name)
        return {"error": f"{exc.__class__.__name__}: {exc}"}
