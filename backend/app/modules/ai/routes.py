"""The two assistants.

One endpoint each, one loop behind both. They are stateless: the client sends
the conversation back each turn, which keeps the server from holding chat
history it has no reason to hold.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.config import settings
from app.core import agent, llm
from app.core.limits import AssistantLimit
from app.deps import DbSession, Lang, Owner, Visitor
from app.modules.ai import copilot, shopper

router = APIRouter(tags=["assistant"])

MAX_TURNS = 16
MAX_CHARS = 1500


class Turn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=MAX_CHARS)


class Ask(BaseModel):
    messages: list[Turn] = Field(min_length=1, max_length=MAX_TURNS)


class Answer(BaseModel):
    reply: str
    #: What the browser should do: open a piece, fill the cart, open WhatsApp.
    #: The cart lives on the visitor's phone, not on our server.
    actions: list[dict] = []
    #: Which tools ran, so an answer can always be audited.
    trace: list[dict] = []


def _answer(reply: agent.Reply) -> Answer:
    return Answer(
        reply=reply.text,
        actions=reply.actions,
        trace=[
            {"tool": call.tool, "ok": call.ok, "duration_ms": call.duration_ms}
            for call in reply.trace
        ],
    )


async def _run(toolbox, body: Ask, lang: str) -> Answer:
    try:
        reply = await agent.run(
            toolbox, [turn.model_dump() for turn in body.messages], lang=lang
        )
    except llm.LlmNotConfigured:
        # 503, not 500: this is a deployment step somebody has not done, and
        # the client should say "not available" rather than "something broke".
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="not_configured"
        ) from None
    except llm.LlmError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return _answer(reply)


@router.get("/assistant/status")
async def assistant_status() -> dict:
    """So the storefront can hide the assistant rather than offering something
    that will fail when someone taps it."""
    return {"available": llm.is_configured(), "whatsapp": bool(settings.whatsapp_number)}


@router.post("/assistant", response_model=Answer)
async def ask_assistant(
    body: Ask, db: DbSession, lang: Lang, visitor: Visitor, _: AssistantLimit
) -> Answer:
    """The shopping concierge. No account needed — it is the storefront."""
    return await _run(shopper.build(db, lang=lang, visitor_id=visitor), body, lang)


@router.post("/admin/copilot", response_model=Answer)
async def ask_copilot(body: Ask, db: DbSession, owner: Owner, lang: Lang) -> Answer:
    """The owner's copilot. Every number it cites comes from the same functions
    the panel reads, so the two cannot disagree."""
    return await _run(copilot.build(db, lang=lang), body, lang)
