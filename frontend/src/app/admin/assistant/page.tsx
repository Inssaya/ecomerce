"use client";

/**
 * The owner's copilot, ported from the deleted workshop's `Copilot` component.
 *
 * The 13 tools it can call already exist (`backend/app/modules/ai/copilot.py`)
 * and every one of them wraps `metrics`/`analytics`/`forecast`, so the
 * assistant can never disagree with the Dashboard. This page is only the
 * chat UI — no new backend work. Note for whoever runs this: it needs a real
 * `LLM_API_KEY` set in the environment before it answers anything; the code
 * is complete but the key is blank by default.
 */
import { useState } from "react";

import { admin } from "@/lib/admin/client";

export default function Assistant() {
  const [turns, setTurns] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [thinking, setThinking] = useState(false);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const question = String(new FormData(form).get("q") ?? "").trim();
    if (!question || thinking) return;
    form.reset();

    const history = [...turns, { role: "user" as const, content: question }];
    setTurns(history);
    setThinking(true);
    try {
      const answer = await admin.copilot(history);
      setTurns([...history, { role: "assistant", content: answer.reply }]);
    } catch {
      setTurns([...history, { role: "assistant", content: "The assistant isn't available right now." }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[24px] font-semibold tracking-tight">AI Assistant</h1>

      {turns.length === 0 ? (
        <p className="text-[15px] text-ink-soft leading-relaxed">
          Ask me: what should I make next? Why was this week worse? What does the refusal rate mean?
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {turns.map((turn, index) => (
          <div
            key={index}
            className={`max-w-[88%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line ${
              turn.role === "user" ? "ms-auto bg-clay text-white" : "me-auto bg-surface shadow-soft"
            }`}
          >
            {turn.content}
          </div>
        ))}
        {thinking ? <div className="me-auto rounded-3xl bg-surface px-4 py-3 text-[15px] text-ink-soft shadow-soft">…</div> : null}
      </div>

      <form onSubmit={send} className="flex gap-2">
        <input name="q" autoComplete="off" className="field flex-1" aria-label="Ask the assistant" />
        <button type="submit" disabled={thinking} className="btn-primary px-5">
          →
        </button>
      </form>
    </div>
  );
}
