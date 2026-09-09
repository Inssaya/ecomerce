"use client";

/**
 * When a console screen throws.
 *
 * There was no error boundary anywhere under `/admin` — twenty-seven files
 * and not one — so any unhandled render error handed the owner Next's own
 * crash page: a stack trace in development, and a blank screen in production.
 * That is the worst possible answer for the one person who has to run the
 * shop today, because it says nothing about whether the rest of the console
 * still works, and offers no way back except the browser's Back button.
 *
 * This is deliberately not a "something went wrong" shrug. It says which
 * screen failed, offers the two things that actually help — try again, or go
 * somewhere that works — and keeps the digest, because that is the string
 * that matches a line in the server log when it needs chasing.
 *
 * `reset()` re-renders the segment without a full reload, so a failure caused
 * by one bad response recovers without losing the rest of the session.
 */
import { useEffect } from "react";

import { Button, LinkButton } from "./ui/primitives";

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The browser console is where this is actually read from, and Next does
    // not log it for us in production.
    console.error("Console screen failed:", error);
  }, [error]);

  return (
    <div className="console-card" style={{ maxWidth: 560, margin: "48px auto" }}>
      <h1 className="console-h2">This screen didn&apos;t load.</h1>
      <p className="console-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
        Something on this page failed while it was being drawn. The rest of the
        console is unaffected — orders, messages and the catalogue are still
        there.
      </p>

      <div className="console-row" style={{ gap: 8, marginTop: 20 }}>
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <LinkButton href="/admin">Back to the Board</LinkButton>
      </div>

      {error.digest ? (
        <p className="console-muted" style={{ marginTop: 18, fontSize: "var(--t-sm)" }}>
          Reference <span className="console-num">{error.digest}</span> — quote this if it keeps
          happening; it matches a line in the server log.
        </p>
      ) : null}
    </div>
  );
}
