"use client";

/**
 * The small number of chart shapes this panel needs, hand-drawn in SVG.
 *
 * **Why there is no colour coding anywhere below.** MoStyle's palette is one
 * warm family on purpose — clay, sand, cream — and a single family cannot
 * carry a categorical encoding. Measured rather than guessed: clay against the
 * warn red is ΔE 10 to normal vision and 5.6 in the night theme, which is to
 * say the same colour. Green is worse — ΔE 2.7 against clay for a protanope.
 *
 * The fix is not to invent a blue. It is to stop asking colour to carry
 * meaning: every chart here is one series in clay, and everything that would
 * otherwise be a second hue is position, length, or a word. That happens to be
 * what a good chart does anyway. If you are about to add `stroke="green"` to
 * one of these, this paragraph is why you should not.
 *
 * No chart library either. These are four shapes; a dependency to draw four
 * shapes is a dependency to keep patched forever.
 */
import type { ReactNode } from "react";

/** Ticks in the shop's own mono, wherever digits appear. */
export function Stat({
  label,
  value,
  note,
  quiet,
}: {
  label: string;
  value: string;
  note?: string;
  quiet?: boolean;
}) {
  return (
    <div className="card p-4 shadow-soft">
      <p className="text-[13px] text-ink-soft">{label}</p>
      <p
        className={`stamp mt-1 text-[24px] font-semibold tabular-nums ${quiet ? "text-ink-soft" : ""}`}
      >
        {value}
      </p>
      {note ? <p className="mt-0.5 text-[12px] text-ink-soft leading-snug">{note}</p> : null}
    </div>
  );
}

/**
 * Visitors over the period.
 *
 * An area rather than a line: the question is "is this going up", not "what
 * was Tuesday", and a filled shape answers that from across a room. The last
 * point is marked because today is the one day the owner is actually looking
 * for.
 */
export function Sparkline({
  points,
  label,
  height = 64,
}: {
  points: { date: string; visitors: number }[];
  label: string;
  height?: number;
}) {
  if (points.length < 2) return null;

  const width = 320;
  const top = 6;
  const peak = Math.max(...points.map((point) => point.visitors), 1);
  const step = width / (points.length - 1);
  const y = (value: number) => top + (height - top - 2) * (1 - value / peak);

  const line = points.map((point, index) => `${index * step},${y(point.visitors)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`${label}: ${points.map((p) => `${p.date} ${p.visitors}`).join(", ")}`}
      >
        <polygon
          points={`0,${height} ${line} ${width},${height}`}
          fill="hsl(var(--clay))"
          fillOpacity="0.14"
        />
        <polyline
          points={line}
          fill="none"
          stroke="hsl(var(--clay))"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[12px] text-ink-soft">
        <span>{points[0].date.slice(5)}</span>
        <span className="stamp tabular-nums">
          {last.visitors} · {last.date.slice(5)}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The funnel, drawn as what it is: each step narrower than the one above.
 *
 * Bars rather than the tapering trapezoid every analytics product draws,
 * because a trapezoid encodes the number in an area nobody can compare and
 * this has to be read on a phone. Every bar carries its own number, so the
 * chart is never the only place the value exists.
 */
export function Funnel({
  steps,
  lang,
}: {
  steps: {
    step: string;
    step_ar: string;
    people: number;
    of_all_pct: number;
    kept_pct: number;
    lost: number;
  }[];
  lang: "en" | "ar";
}) {
  if (!steps.length) return null;
  const worst = Math.max(...steps.slice(1).map((step) => step.lost), 0);

  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((step, index) => {
        // The step that loses the most people is the one sentence on this
        // screen worth acting on, so it says so in words rather than in a hue.
        const biggestLeak = index > 0 && step.lost === worst && worst > 0;
        return (
          <li key={step.step}>
            <div className="flex items-baseline justify-between gap-3 text-[14px]">
              <span className="font-medium">{lang === "ar" ? step.step_ar : step.step}</span>
              <span className="stamp tabular-nums text-ink-soft">
                {step.people}
                {index > 0 ? ` · ${step.kept_pct}%` : ""}
              </span>
            </div>
            <div className="mt-1 h-2.5 rounded-full bg-clay-soft overflow-hidden">
              <div
                className="h-full rounded-full bg-clay transition-all duration-gentle"
                style={{ width: `${Math.max(step.of_all_pct, step.people ? 1.5 : 0)}%` }}
              />
            </div>
            {biggestLeak ? (
              <p className="mt-1 text-[12px] text-warn">
                {lang === "ar"
                  ? `أكبر تسرّب — ${step.lost} شخصاً توقفوا هنا`
                  : `Biggest drop — ${step.lost} people stopped here`}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A number as a proportion of the widest in its column.
 *
 * Used inside tables, where the eye is comparing down a column and the digits
 * alone make that work. The bar sits behind the number rather than beside it
 * so a narrow phone column can hold both.
 */
export function Meter({ value, of, children }: { value: number; of: number; children: ReactNode }) {
  const width = of > 0 ? Math.min(100, (value / of) * 100) : 0;
  return (
    <div className="relative">
      <div
        className="absolute inset-y-0 start-0 rounded-[4px] bg-clay-soft"
        style={{ width: `${width}%` }}
        aria-hidden
      />
      <span className="relative stamp text-[13px] tabular-nums">{children}</span>
    </div>
  );
}

/**
 * Confidence, as a shape rather than a colour.
 *
 * Three filled dots, two, or one. Colour is unavailable here for the reason
 * at the top of this file, and it would have been the wrong encoding anyway —
 * confidence is ordered, and dots are ordered.
 */
export function Confidence({ level, lang }: { level: string; lang: "en" | "ar" }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const word =
    lang === "ar"
      ? { high: "مؤكد", medium: "متوسط", low: "تخمين" }[level] ?? level
      : level;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
      <span className="flex gap-[3px]" aria-hidden>
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className={`h-[6px] w-[6px] rounded-full ${
              dot < filled ? "bg-ink-soft" : "border border-ink-soft/40"
            }`}
          />
        ))}
      </span>
      {word}
    </span>
  );
}

/** A scrolling table that never makes the page scroll sideways. */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr className="text-ink-soft">
            {head.map((cell, index) => (
              <th
                key={cell}
                scope="col"
                className={`pb-2 font-medium ${index === 0 ? "text-start" : "text-end ps-3"}`}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
