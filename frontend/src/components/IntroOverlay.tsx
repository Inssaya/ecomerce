"use client";

import { useEffect, useRef, useState } from "react";

/** Milliseconds between one word landing and the next. */
const WORD_MS = 70;
/** How long a finished line sits, fully revealed, before it steps aside. */
const HOLD_MS = 1300;
/** The cross-fade between one line leaving and the next arriving. */
const FADE_MS = 260;

/**
 * The shop introducing itself out loud before it hands you the page.
 *
 * Every line already exists, in full, in the real page underneath this — that
 * page is what a no-JS visitor and a search crawler both see, immediately,
 * with nothing missing. This is a second thing laid on top of it for
 * everyone else: an entrance that speaks one line at a time, word by word,
 * and then gets out of the way.
 *
 * It never renders during server rendering (`mounted` starts false), so a
 * visitor without JavaScript never sees a curtain that JavaScript was
 * supposed to lift and didn't — they just see the page. Reduced-motion and
 * "skip" both take the same exit: straight to `onDone`.
 *
 * The cream sheet holds still. Only the sentence on it fades. Fading the whole
 * fixed container between lines — which is what this used to do — took the
 * background with it, so the real page flashed through the gap and vanished
 * again five times in a row on the way in. That is not a transition, it is a
 * strobe, and it read as a page failing to load.
 */
export function IntroOverlay({
  lines,
  back,
  skip,
}: {
  lines: string[];
  back: string;
  skip: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [closed, setClosed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setClosed(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted || closed) return undefined;
    const words = lines[step]?.split(" ").length ?? 0;
    const revealMs = words * WORD_MS + 250;

    clearTimeout(timer.current);
    if (!leaving) {
      timer.current = setTimeout(() => setLeaving(true), revealMs + HOLD_MS);
    } else {
      timer.current = setTimeout(() => {
        if (step >= lines.length - 1) {
          setClosed(true);
          return;
        }
        setStep((current) => current + 1);
        setLeaving(false);
      }, FADE_MS);
    }
    return () => clearTimeout(timer.current);
  }, [mounted, step, leaving, closed, lines]);

  function goBack() {
    if (step === 0) return;
    clearTimeout(timer.current);
    setStep((current) => current - 1);
    setLeaving(false);
  }

  if (!mounted || closed) return null;

  // The sheet itself only ever fades once: on the way out, after the last line.
  // Between lines it stays put, which is the whole point.
  const lifting = leaving && step >= lines.length - 1;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-cream px-6
                  transition-opacity duration-[260ms] ease-gentle
                  ${lifting ? "opacity-0" : "opacity-100"}`}
      role="status"
      aria-live="polite"
    >
      <p
        key={step}
        className={`stamp max-w-[30ch] text-center text-[clamp(20px,3.2vw,32px)] leading-[1.45]
                    text-ink transition-opacity duration-[260ms] ease-gentle
                    ${leaving ? "opacity-0" : "opacity-100"}`}
      >
        {lines[step].split(" ").map((word, index) => (
          <span
            key={index}
            className="inline-block animate-word-in opacity-0"
            style={{ animationDelay: `${index * WORD_MS}ms` }}
          >
            {word}&nbsp;
          </span>
        ))}
      </p>

      <div className="flex items-center gap-4 text-[13px] font-medium text-ink-mute">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0}
          className="tap transition-colors duration-200 hover:text-ink disabled:opacity-30"
        >
          {back}
        </button>
        <span aria-hidden className="text-sand">
          ·
        </span>
        <button
          type="button"
          onClick={() => setClosed(true)}
          className="tap transition-colors duration-200 hover:text-ink"
        >
          {skip}
        </button>
      </div>
    </div>
  );
}
