"""Client for any OpenAI-compatible API.

Adapted from the ANTIV project's `app/ai/llm.py` — the retry handling, the
rate-limit parsing and the usage logging are that file's, and they are here
because they were already right. What changed:

* async, on `httpx.AsyncClient`, because this application is async throughout
  and the original was called from a threadpool.
* one shared client instead of a new connection per call.
* an `embed` function, which that project did not need.

Talking to the raw endpoint rather than a vendor SDK keeps the provider a
configuration change: the same code drives OpenAI, Groq or a local model.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 90
MAX_RETRIES = 2
MAX_RETRY_WAIT_SECONDS = 25

_client: httpx.AsyncClient | None = None


class LlmError(RuntimeError):
    """The model could not answer: network, auth, rate limit, bad response."""


class LlmNotConfigured(LlmError):
    """No API key. Every AI feature degrades to "unavailable", never to a
    guess — an assistant that invents a delivery date is worse than none."""


def is_configured() -> bool:
    return bool(settings.llm_api_key)


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=settings.llm_base_url,
            headers={"Authorization": f"Bearer {settings.llm_api_key}"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _retry_after_seconds(response: httpx.Response) -> float:
    """How long the API says to wait, clamped so nothing hangs for long.

    Values arrive as "3", "1m26.4s" or "577ms" depending on the provider.
    """
    raw = str(
        response.headers.get("retry-after") or response.headers.get("x-ratelimit-reset-tokens", "")
    ).strip().lower()
    try:
        if raw.endswith("ms"):
            seconds = float(raw[:-2]) / 1000
        elif "m" in raw and "s" in raw:
            minutes, rest = raw.split("m", 1)
            seconds = float(minutes) * 60 + float(rest.rstrip("s") or 0)
        else:
            seconds = float(raw.rstrip("s"))
    except (TypeError, ValueError):
        seconds = 5.0
    return max(1.0, min(seconds + 0.5, MAX_RETRY_WAIT_SECONDS))


async def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not is_configured():
        raise LlmNotConfigured("AI is not configured (LLM_API_KEY is empty)")

    client = _get_client()
    for attempt in range(MAX_RETRIES + 1):
        try:
            response = await client.post(path, json=payload)
        except httpx.HTTPError as exc:
            raise LlmError(f"Could not reach the AI service: {exc.__class__.__name__}") from exc

        if response.status_code == 401:
            raise LlmError("The AI service rejected the API key — check LLM_API_KEY")
        if response.status_code == 429:
            if attempt < MAX_RETRIES:
                wait = _retry_after_seconds(response)
                logger.info("LLM rate-limited; retrying in %.1fs", wait)
                await asyncio.sleep(wait)
                continue
            raise LlmError("The AI service is rate-limited — try again in a moment")
        if response.status_code >= 400:
            # The body can echo our prompt and the account id: log a trimmed
            # copy server-side, return something generic to the caller.
            logger.error("LLM error %s: %s", response.status_code, response.text[:500])
            raise LlmError(f"AI service error (HTTP {response.status_code})")

        return response.json()

    raise LlmError("AI service unavailable")


async def chat(
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    temperature: float = 0.3,
    max_tokens: int = 900,
) -> dict[str, Any]:
    """One chat-completions call. Returns the assistant message, which may
    carry `tool_calls` instead of or alongside `content`.

    `max_tokens` is a reservation against the per-minute budget, not just a
    ceiling — keep it as small as the answer needs, or an agent loop trips the
    rate limit after two rounds.
    """
    payload: dict[str, Any] = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    data = await _post("/chat/completions", payload)

    usage = data.get("usage") or {}
    if usage:
        cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
        logger.info(
            "LLM usage: prompt=%s (cached=%s) completion=%s",
            usage.get("prompt_tokens", 0),
            cached,
            usage.get("completion_tokens", 0),
        )
    try:
        return data["choices"][0]["message"]
    except (KeyError, IndexError) as exc:
        raise LlmError("The AI service returned an unexpected response") from exc


async def embed(texts: list[str]) -> list[list[float]]:
    """Embed a batch. Batching matters: one request for forty pieces instead
    of forty requests."""
    if not texts:
        return []
    data = await _post(
        "/embeddings", {"model": settings.embedding_model, "input": texts}
    )
    try:
        rows = sorted(data["data"], key=lambda row: row["index"])
        return [row["embedding"] for row in rows]
    except (KeyError, TypeError) as exc:
        raise LlmError("The embedding service returned an unexpected response") from exc
