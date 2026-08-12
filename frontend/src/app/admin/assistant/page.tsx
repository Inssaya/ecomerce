"use client";

/**
 * The copilot. The Board shows *what*; this answers *why, and what next*.
 *
 * The bug worth naming: a failed turn used to write a fabricated assistant
 * message into the transcript — "the assistant isn't available right now" —
 * and the next question replayed the whole transcript to the server as
 * context. The model was being told it had said something it never said.
 * Failures are UI state now; history only ever holds real turns, and a failed
 * turn can be retried without leaving a scar in it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/console/api";
import { NotSignedIn, bounceToSignIn } from "@/lib/console/auth";

import { Button, Card, ControlStrip, EmptyState, Pill } from "../ui/primitives";

type Turn = { role: "user" | "assistant"; content: string };

const HISTORY_KEY = "mostyle_console_chat";
const SERVER_TURN_LIMIT = 16;
const MAX_CHARS = 1500;

const SUGGESTIONS = [
  "What should I make next?",
  "Why did this week look worse?",
  "What does the refusal rate mean?",
  "Which piece is doing best?",
];

function loadTurns(): Turn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Turn[]) : [];
  } catch {
    return [];
  }
}

export default function Assistant() {
  const [turns, setTurns] = useState<Turn[]>(loadTurns);
  const [thinking, setThinking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [lastAsked, setLastAsked] = useState<string | null>(null);
  const [trace, setTrace] = useState<{ tool: string; ok: boolean; duration_ms: number }[]>([]);
  const [value, setValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(turns));
    } catch {
      /* private mode — the conversation just won't survive a tab switch */
    }
  }, [turns]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, thinking]);

  const ask = useCallback(
    async (question: string, replacingFailure = false) => {
      const clean = question.trim();
      if (!clean || thinking) return;

      setValue("");
      setFailure(null);
      setLastAsked(clean);

      // On a retry the question is already the last turn — don't add it twice.
      const history: Turn[] = replacingFailure ? turns : [...turns, { role: "user", content: clean }];
      setTurns(history);
      setThinking(true);

      try {
        const answer = await api.copilot(history.slice(-SERVER_TURN_LIMIT));
        setTurns([...history, { role: "assistant", content: answer.reply }]);
        setTrace(answer.trace ?? []);
      } catch (problem) {
        if (problem instanceof NotSignedIn) {
          bounceToSignIn();
        } else {
          // Nothing enters the transcript. The failure is UI, not a turn.
          const message = problem instanceof Error ? problem.message : "";
          setFailure(
            message === "not_configured"
              ? "There's no API key set up for me yet — that's a setup step, not a bug. Whoever runs the server needs to set LLM_API_KEY."
              : "I couldn't reach the assistant. Nothing was lost — try again.",
          );
        }
      } finally {
        setThinking(false);
      }
    },
    [thinking, turns],
  );

  return (
    <>
      <ControlStrip
        groups={[]}
        trailing={
          <>
            {trace.length ? <Pill tone="neutral">{trace.length} tools read</Pill> : null}
            {turns.length > 0 ? (
              <Button
                size="sm"
                onClick={() => {
                  setTurns([]);
                  setTrace([]);
                  setFailure(null);
                }}
              >
                New conversation
              </Button>
            ) : null}
          </>
        }
      />

      <div className="console-chat">
        {turns.length === 0 && !thinking ? (
          <EmptyState
            title="Ask about the shop."
            hint="What to make next, why a number moved, what a figure on the Board means. Every number I give comes from the same source the Board reads."
          />
        ) : null}

        <div className="console-thread">
          {turns.map((turn, index) => (
            <div key={index} dir="auto" className={`console-bubble console-bubble-${turn.role}`}>
              {turn.content}
            </div>
          ))}
          {thinking ? (
            <div className="console-bubble console-bubble-assistant console-muted" aria-live="polite">
              Thinking…
            </div>
          ) : null}
          <div ref={bottomRef} aria-hidden />
        </div>

        {/* A failure sits beside the conversation, never inside it. */}
        {failure ? (
          <Card pad="sm">
            <p className="console-error">{failure}</p>
            {lastAsked ? (
              <Button icon="refresh" onClick={() => void ask(lastAsked, true)} style={{ alignSelf: "flex-start" }}>
                Try again
              </Button>
            ) : null}
          </Card>
        ) : null}

        {/* Which tools ran. The whole claim is that every number comes from
            a tool result, so it should be checkable. */}
        {trace.length > 0 ? (
          <details>
            <summary className="console-caps" style={{ cursor: "pointer" }}>
              Where those numbers came from
            </summary>
            <ul className="console-stack-sm" style={{ marginTop: 8 }}>
              {trace.map((entry, index) => (
                <li key={index} className="console-row-between console-muted" style={{ fontSize: "var(--t-xs)" }}>
                  <span className="console-num">{entry.tool}</span>
                  <span>
                    {entry.ok ? "ok" : "failed"} · {entry.duration_ms}ms
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {turns.length === 0 ? (
          <div className="console-row">
            {SUGGESTIONS.map((question) => (
              <button key={question} type="button" disabled={thinking} onClick={() => void ask(question)} className="console-chip">
                {question}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="console-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(value);
          }}
        >
          <textarea
            rows={1}
            value={value}
            maxLength={MAX_CHARS}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(value);
              }
            }}
            placeholder="Ask about the shop…"
            aria-label="Ask the assistant"
            dir="auto"
          />
          <Button type="submit" variant="primary" iconOnly icon="arrow-right" disabled={thinking || !value.trim()} aria-label="Send" />
        </form>
      </div>
    </>
  );
}
