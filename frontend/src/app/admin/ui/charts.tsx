"use client";

/**
 * The console's charts. Each form is chosen for the job the reader has,
 * not carried over from the last screen.
 *
 * Rules that hold across all of them:
 *  · charts never use --accent; a chart must not compete with a button
 *  · status colour means good/bad, never "series 2"
 *  · nominal categories get ONE hue for every bar — a value-ramp on
 *    nominal data double-encodes bar length as lightness
 *  · ordered categories (the funnel) get the ordinal ramp
 *  · anything whose values are revealed by pointing carries a table twin,
 *    so no number is reachable only by hovering. The bar forms print their
 *    values on the row already and need no twin.
 *  · direct-label selectively; never a number on every mark
 */
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { Num } from "./primitives";

// ── Meter — one ratio against a limit ────────────────────────────────────────

/**
 * The refusal rate lives here. A bare percentage was the old treatment and
 * it is the number that decides whether this business works.
 *
 * `minDenominator` is the honesty guard: 1 refusal out of 2 deliveries is
 * 50%, which looks catastrophic and means nothing. Below the threshold the
 * meter refuses to render a judgement.
 */
export function Meter({
  value,
  target,
  max,
  denominator,
  minDenominator = 10,
  lowerIsBetter = true,
  caption,
}: {
  value: number;
  target?: number;
  max?: number;
  denominator?: number;
  minDenominator?: number;
  lowerIsBetter?: boolean;
  caption?: ReactNode;
}) {
  const ceiling = max ?? (Math.max(value, target ?? 0) * 1.4 || 100);
  const tooFew = denominator !== undefined && denominator < minDenominator;
  const meeting = target === undefined ? null : lowerIsBetter ? value <= target : value >= target;
  const tone = tooFew ? "tone-none" : meeting === null ? "" : meeting ? "tone-ok" : "tone-danger";

  return (
    <div className="console-meter">
      <div className="console-row" style={{ gap: 10, alignItems: "baseline" }}>
        <span className="console-metric" style={{ color: tooFew ? "var(--ink3)" : undefined }}>
          {value.toFixed(1)}%
        </span>
        {target !== undefined ? <span className="console-muted">target {lowerIsBetter ? "≤" : "≥"} {target}%</span> : null}
      </div>
      <div className="console-meter-track">
        <span className={`console-meter-fill ${tone}`} style={{ width: `${Math.min(100, (value / ceiling) * 100)}%` }} />
        {target !== undefined ? (
          <span className="console-meter-target" style={{ insetInlineStart: `${Math.min(100, (target / ceiling) * 100)}%` }} title={`target ${target}%`} />
        ) : null}
      </div>
      {tooFew ? (
        <p className="console-muted">Too few deliveries to judge yet — {denominator} so far.</p>
      ) : caption ? (
        <p className="console-muted">{caption}</p>
      ) : null}
    </div>
  );
}

// ── Ranked bars — magnitude across nominal items ─────────────────────────────

/**
 * One hue for every bar. Cities and pieces have no natural order, so
 * darker-where-bigger would encode the bar's length twice and burn the
 * only free channel on information the chart already shows.
 */
export function RankedBars({
  rows,
  formatValue,
  tone,
  max: givenMax,
}: {
  /** `href` makes the label open the thing it names — a bar that names a
      piece and cannot be opened is a dead end on a screen about acting. */
  rows: { label: string; value: number; sub?: string; href?: string; tone?: "ok" | "warn" | "danger" }[];
  formatValue?: (value: number) => ReactNode;
  tone?: "nominal" | "status";
  max?: number;
}) {
  if (rows.length === 0) return null;
  const max = givenMax ?? Math.max(...rows.map((row) => row.value), 1);

  return (
    <table className="console-table" style={{ minWidth: 0 }}>
      <tbody>
        {rows.map((row) => {
          const colour =
            tone === "status" && row.tone
              ? row.tone === "ok"
                ? "var(--ok)"
                : row.tone === "warn"
                  ? "var(--warn)"
                  : "var(--danger)"
              : "var(--chart-nominal)";
          return (
            <tr key={row.label}>
              <td style={{ width: "38%", borderBottom: 0, paddingInlineStart: 0 }}>
                {row.href ? (
                  <Link href={row.href} className="console-link" dir="auto">
                    {row.label}
                  </Link>
                ) : (
                  <span dir="auto">{row.label}</span>
                )}
                {row.sub ? <div className="console-cell-sub">{row.sub}</div> : null}
              </td>
              <td style={{ borderBottom: 0 }}>
                <span style={{ display: "block", height: 8, background: "var(--chart-track)", borderRadius: 4, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${(row.value / max) * 100}%`, background: colour, borderRadius: 4 }} />
                </span>
              </td>
              <td className="align-right" style={{ width: 78, borderBottom: 0, paddingInlineEnd: 0 }}>
                {formatValue ? formatValue(row.value) : <Num value={row.value} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Area — a single series over time ─────────────────────────────────────────

/**
 * A single series over time, readable three ways.
 *
 * It was mouse-only: `onMouseMove` alone means every value on this chart is
 * unreachable on a phone — which is half of where this console is read — and
 * unreachable by keyboard anywhere. Now the crosshair follows a pointer of
 * any kind, arrow keys walk it, and the twin below prints every value as a
 * table so nothing is hover-only.
 */
export function TrendArea({
  points,
  label,
  format,
  height = 96,
}: {
  points: { date: string; value: number }[];
  label: string;
  format?: (value: number) => string;
  height?: number;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const width = 720;
  const pad = 8;
  const peak = Math.max(...points.map((p) => p.value), 1);
  const step = width / (points.length - 1);
  const y = (value: number) => pad + (height - pad * 2) * (1 - value / peak);
  const line = points.map((point, index) => `${index * step},${y(point.value)}`).join(" ");
  const active = hover === null ? points.length - 1 : hover;
  const shown = points[active];
  const show = (value: number) => (format ? format(value) : value.toLocaleString("en-US"));

  const moveTo = (index: number) => setHover(Math.max(0, Math.min(points.length - 1, index)));

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="console-trend"
          style={{ width: "100%", height, display: "block", touchAction: "pan-y" }}
          role="img"
          tabIndex={0}
          // The label carries the reading, so a screen reader gets the value
          // rather than only being told a chart is present.
          aria-label={`${label} over ${points.length} days. ${shown.date}: ${show(shown.value)}. Use arrow keys to move through the days.`}
          // Pointer, not mouse — one handler covers touch, pen and mouse.
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - box.left) / box.width;
            moveTo(Math.round(ratio * (points.length - 1)));
          }}
          onPointerDown={(event) => {
            // A tap must land somewhere. Without this, touch shows the last
            // day and never moves, because there is no hover on a phone.
            const box = event.currentTarget.getBoundingClientRect();
            moveTo(Math.round(((event.clientX - box.left) / box.width) * (points.length - 1)));
          }}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") moveTo(active - 1);
            else if (event.key === "ArrowRight") moveTo(active + 1);
            else if (event.key === "Home") moveTo(0);
            else if (event.key === "End") moveTo(points.length - 1);
            else if (event.key === "Escape") setHover(null);
            else return;
            event.preventDefault();
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-nominal)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--chart-nominal)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${gradientId})`} />
          <polyline points={line} fill="none" stroke="var(--chart-nominal)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line x1={active * step} y1={0} x2={active * step} y2={height} stroke="var(--chart-grid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <circle cx={active * step} cy={y(shown.value)} r="4" fill="var(--chart-nominal)" stroke="var(--bg1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <figcaption className="console-row-between" style={{ marginTop: 6 }}>
        <span className="console-muted">{points[0].date.slice(5)}</span>
        <span className="console-num console-strong">
          {show(shown.value)} · {shown.date.slice(5)}
        </span>
      </figcaption>
      <ChartTable summary={`All ${points.length} days`} head={["Day", label]}>
        {points.map((point) => (
          <tr key={point.date}>
            <td className="console-num">{point.date}</td>
            <td className="align-right console-num">{show(point.value)}</td>
          </tr>
        ))}
      </ChartTable>
    </figure>
  );
}

/**
 * A sparkline for a stat tile — shape only, no axis, no interaction.
 *
 * Deliberately not a small `TrendArea`: inside a tile there is no room for a
 * crosshair or a caption, and the tile's own value is the number being read.
 * The shape answers "is this going up or down", nothing more.
 */
export function Sparkline({
  points,
  height = 28,
  label,
}: {
  points: { date: string; value: number }[];
  height?: number;
  label: string;
}) {
  if (points.length < 2) return null;
  const width = 160;
  const peak = Math.max(...points.map((point) => point.value), 1);
  const step = width / (points.length - 1);
  const line = points.map((point, index) => `${index * step},${height - 2 - (height - 4) * (point.value / peak)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block", marginTop: 6 }}
      role="img"
      aria-label={label}
    >
      <polygon points={`0,${height} ${line} ${width},${height}`} fill="var(--chart-nominal)" opacity="0.12" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--chart-nominal)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The table twin every chart above needs.
 *
 * Collapsed, because the chart is the point — but present, because a value
 * reachable only by hovering is a value some readers simply cannot have.
 */
export function ChartTable({ summary, head, children }: { summary: string; head: string[]; children: ReactNode }) {
  return (
    <details className="console-chart-table">
      <summary>{summary}</summary>
      <div className="console-table-wrap">
        <table className="console-table" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={cell} scope="col" className={index > 0 ? "align-right" : undefined}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </details>
  );
}

// ── Funnel — ordered magnitude with drop-off ─────────────────────────────────

/**
 * Ordered categories, so this is the one chart that uses the ordinal ramp.
 * Every step prints what it lost; the largest drop is the most valuable
 * sentence on the screen, so it is the one that gets a direct label.
 */
export function Funnel({ steps }: { steps: { step: string; people: number; of_all_pct: number; kept_pct: number; lost: number }[] }) {
  if (steps.length === 0) return null;
  const worst = Math.max(...steps.slice(1).map((step) => step.lost), 0);

  return (
    <ol className="console-stack-sm">
      {steps.map((step, index) => {
        const biggest = index > 0 && step.lost === worst && worst > 0;
        const ramp = `var(--chart-ordinal-${Math.min(6, index + 1)})`;
        return (
          <li key={step.step}>
            <div className="console-row-between" style={{ fontSize: "var(--t-base)" }}>
              <span className="console-strong">{step.step}</span>
              <span className="console-num console-muted">
                {step.people.toLocaleString("en-US")}
                {index > 0 ? ` · kept ${step.kept_pct}%` : ""}
              </span>
            </div>
            <div style={{ marginTop: 5, height: 10, background: "var(--chart-track)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(step.of_all_pct, step.people ? 1.5 : 0)}%`, background: ramp, borderRadius: 5 }} />
            </div>
            {index > 0 && step.lost > 0 ? (
              <p style={{ marginTop: 3, fontSize: "var(--t-xs)", color: biggest ? "var(--warn)" : "var(--ink3)" }}>
                {biggest ? "Biggest drop — " : ""}
                {step.lost.toLocaleString("en-US")} stopped here
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ── Ranged dot plot — an estimate with its uncertainty ───────────────────────

/**
 * The forecast. A point estimate alone reads as a promise, which is exactly
 * what the range exists to prevent — so the whisker is the mark and the dot
 * merely sits on it.
 *
 * If every range collapses to the same span the chart says nothing, so the
 * caller is told to fall back to a list.
 */
export function RangedDots({
  rows,
}: {
  rows: { label: string; expected: number; low: number; high: number; note?: string; href?: string }[];
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.high), 1);

  return (
    <table className="console-table" style={{ minWidth: 0 }}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td style={{ width: "38%", borderBottom: 0, paddingInlineStart: 0 }}>
              {row.href ? (
                <Link href={row.href} className="console-link" dir="auto">
                  {row.label}
                </Link>
              ) : (
                <span dir="auto">{row.label}</span>
              )}
              {row.note ? <div className="console-cell-sub">{row.note}</div> : null}
            </td>
            <td style={{ borderBottom: 0 }}>
              <span style={{ position: "relative", display: "block", height: 14 }}>
                <span style={{ position: "absolute", insetBlock: 6, insetInlineStart: 0, right: 0, background: "var(--chart-track)", borderRadius: 1 }} />
                <span
                  style={{
                    position: "absolute",
                    insetBlock: 5,
                    insetInlineStart: `${(row.low / max) * 100}%`,
                    width: `${Math.max(1.5, ((row.high - row.low) / max) * 100)}%`,
                    background: "var(--chart-sequential-3)",
                    borderRadius: 2,
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    insetInlineStart: `calc(${(row.expected / max) * 100}% - 4px)`,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--chart-sequential-5)",
                    boxShadow: "0 0 0 2px var(--bg1)",
                  }}
                />
              </span>
            </td>
            <td className="align-right" style={{ width: 86, borderBottom: 0, paddingInlineEnd: 0 }}>
              {row.low}–{row.high}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** True when every range is the same span — a dot plot would say nothing. */
export function rangesAreDegenerate(rows: { low: number; high: number }[]): boolean {
  if (rows.length < 2) return true;
  const spans = new Set(rows.map((row) => row.high - row.low));
  return spans.size === 1 && Math.max(...rows.map((row) => row.high)) <= 1;
}

// ── Runway — days of cover against a threshold ───────────────────────────────

/**
 * "You run out in four days" is the most actionable sentence the forecast
 * can produce, and it was being dropped entirely.
 */
export function Runway({ rows, threshold = 7 }: { rows: { label: string; days: number | null; href?: string }[]; threshold?: number }) {
  const withCover = rows.filter((row) => row.days !== null) as { label: string; days: number; href?: string }[];
  if (withCover.length === 0) return null;
  const max = Math.max(...withCover.map((row) => row.days), threshold * 2);

  return (
    <RankedBars
      tone="status"
      max={max}
      rows={[...withCover]
        .sort((a, b) => a.days - b.days)
        .map((row) => ({
          label: row.label,
          value: row.days,
          href: row.href,
          tone: row.days <= 3 ? ("danger" as const) : row.days <= threshold ? ("warn" as const) : ("ok" as const),
        }))}
      formatValue={(value) => <span>{value < 1 ? "<1d" : `${Math.round(value)}d`}</span>}
    />
  );
}

// ── Confidence — ordered, so a shape not a hue ───────────────────────────────

export function Confidence({ level }: { level: string }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="console-row" style={{ gap: 5, fontSize: "var(--t-xs)", color: "var(--ink3)" }} title={`${level} confidence`}>
      <span className="console-row" style={{ gap: 3 }} aria-hidden>
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: dot < filled ? "var(--ink2)" : "transparent",
              border: dot < filled ? "none" : "1px solid var(--line2)",
            }}
          />
        ))}
      </span>
      {level}
    </span>
  );
}
