"""The owner's copilot.

One endpoint, backed by the agentic loop in `app.core.agent`. It is
stateless: the client sends the conversation back each turn, which keeps the
server from holding chat history it has no reason to hold.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core import agent, llm
from app.deps import DbSession, Lang, Owner
from app.modules.ai import copilot

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
    #: Actions for the client to carry out, if the toolbox in use produces
    #: any. Part of the generic agent-loop contract; the copilot's toolbox
    #: does not currently use it.
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


@router.post("/admin/copilot", response_model=Answer)
async def ask_copilot(body: Ask, db: DbSession, owner: Owner, lang: Lang) -> Answer:
    """The owner's copilot. Every number it cites comes from the same functions
    the panel reads, so the two cannot disagree."""
    return await _run(copilot.build(db, lang=lang), body, lang)
