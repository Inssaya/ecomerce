"use client";

/**
 * The Board's control strip — period, scope, and the view switch.
 *
 * Shared by both faces (`/admin` and `/admin/make`) so the two cannot drift
 * apart, and so moving between them keeps the owner's period and scope.
 *
 * Two ideas the old strip did not have:
 *
 *  · **The scope drives the page.** Pick a category or a piece and every
 *    figure that *can* narrow, does. This is the centre of the design and it
 *    had never been built — the strip offered a 7/30/90 switch and nothing
 *    else, so there was no way to ask "how is the lamp doing?".
 *
 *  · **The period is a range, not a day count.** "This month" and "last
 *    month" are not expressible as "N days ending today", which is why the
 *    old control could only ever offer trailing windows.
 *
 * Everything lives in the URL, so a scoped Board is a link you can send
 * yourself, reload, and reach with the back button.
 */
import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { api, type Range, type Scope } from "@/lib/console/api";
import { useConsoleQuery } from "@/lib/console/query";

import { ControlStrip, Segmented } from "./ui/primitives";

// ── The period ───────────────────────────────────────────────────────────────

const iso = (date: Date) => {
  // Local date, not `toISOString()` — that converts to UTC first, so anywhere
  // east of Greenwich "today" becomes yesterday for part of the day.
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const trailing = (days: number): Range => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { from: iso(start), to: iso(end) };
};

const monthOf = (offset: number): Range => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = offset === 0 ? now : new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: iso(start), to: iso(end) };
};

export const PRESETS = {
  "7d": { label: "Last 7 days", range: () => trailing(7) },
  "30d": { label: "Last 30 days", range: () => trailing(30) },
  month: { label: "This month", range: () => monthOf(0) },
  "last-month": { label: "Last month", range: () => monthOf(-1) },
  "90d": { label: "Last 90 days", range: () => trailing(90) },
  custom: { label: "Custom range…", range: () => trailing(30) },
} as const;

export type PresetKey = keyof typeof PRESETS;

const DEFAULT_PRESET: PresetKey = "30d";

// ── The query the whole Board reads from ─────────────────────────────────────

export interface BoardQuery {
  preset: PresetKey;
  range: Range;
  scope: Scope;
  /** A stable string for the cache key, so scoped and unscoped never collide. */
  key: string;
  /** How the period should be named in prose — "the last 30 days". */
  label: string;
  /** The same period as a tile label, where "the last 30 days" reads badly. */
  short: string;
  days: number;
}

function daysBetween(range: Range): number {
  const ms = new Date(range.to).getTime() - new Date(range.from).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export function useBoardQuery(): BoardQuery {
  const params = useSearchParams();

  return useMemo(() => {
    const raw = params.get("period");
    const preset: PresetKey = raw && raw in PRESETS ? (raw as PresetKey) : DEFAULT_PRESET;

    const from = params.get("from");
    const to = params.get("to");
    const range = preset === "custom" && from && to ? { from, to } : PRESETS[preset].range();

    const scope: Scope = {};
    const categoryId = params.get("cat");
    const productId = params.get("piece");
    if (categoryId) scope.categoryId = categoryId;
    if (productId) scope.productId = productId;

    const days = daysBetween(range);
    const label =
      preset === "month"
        ? "this month"
        : preset === "last-month"
          ? "last month"
          : preset === "custom"
            ? `${range.from} → ${range.to}`
            : `the last ${days} days`;

    return {
      preset,
      range,
      scope,
      key: `${range.from}:${range.to}:${scope.categoryId ?? ""}:${scope.productId ?? ""}`,
      label,
      short: preset === "custom" ? `${range.from} → ${range.to}` : label.replace(/^the last /, ""),
      days,
    };
  }, [params]);
}

/** Writes a patch into the URL, dropping keys set back to their default. */
function useSetQuery() {
  const router = useRouter();
  const params = useSearchParams();

  return useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const search = next.toString();
      // `scroll: false` — changing a filter must not throw the owner back to
      // the top of a screen they were reading halfway down.
      router.replace(search ? `?${search}` : "?", { scroll: false });
    },
    [params, router],
  );
}

// ── The strip ────────────────────────────────────────────────────────────────

export function BoardStrip({ view }: { view: "today" | "make" }) {
  const router = useRouter();
  const params = useSearchParams();
  const query = useBoardQuery();
  const setQuery = useSetQuery();

  // The catalogue is small and both dropdowns need it, so it is one cached
  // request shared by every Board render rather than one per control.
  const categories = useConsoleQuery("board:categories", useCallback(() => api.categories(), []));
  const products = useConsoleQuery("board:products", useCallback(() => api.products({ status: "active" }), []));

  const categoryId = query.scope.categoryId ?? "";
  const productId = query.scope.productId ?? "";

  // Narrowing the category narrows the pieces on offer — otherwise the piece
  // list is 48 titles with no relationship to the category just chosen.
  const piecesInScope = useMemo(
    () => (products.data ?? []).filter((piece) => !categoryId || piece.category_id === categoryId),
    [products.data, categoryId],
  );

  const groups = [
    {
      label: "Period",
      // `ControlStrip` already wraps these in `.console-strip-controls`;
      // nesting a second one only added another box to size.
      controls: (
        <>
          <select
            className="console-select"
            aria-label="Period"
            value={query.preset}
            onChange={(event) => {
              const preset = event.target.value as PresetKey;
              // A custom range needs its own dates in the URL, or reloading
              // would silently fall back to a trailing 30 days.
              const range = PRESETS[preset].range();
              setQuery({
                period: preset === DEFAULT_PRESET ? null : preset,
                from: preset === "custom" ? range.from : null,
                to: preset === "custom" ? range.to : null,
              });
            }}
          >
            {Object.entries(PRESETS).map(([value, preset]) => (
              <option key={value} value={value}>
                {preset.label}
              </option>
            ))}
          </select>

          {query.preset === "custom" ? (
            <>
              <input
                type="date"
                className="console-date"
                aria-label="From"
                value={query.range.from}
                max={query.range.to}
                onChange={(event) => setQuery({ from: event.target.value })}
              />
              <span className="console-muted">→</span>
              <input
                type="date"
                className="console-date"
                aria-label="To"
                value={query.range.to}
                min={query.range.from}
                max={iso(new Date())}
                onChange={(event) => setQuery({ to: event.target.value })}
              />
            </>
          ) : null}
        </>
      ),
    },
    {
      label: "Scope",
      controls: (
        <>
          <select
            className="console-select"
            aria-label="Category"
            value={categoryId}
            onChange={(event) =>
              // Changing category drops the piece: a piece from the old
              // category would contradict the category now displayed.
              setQuery({ cat: event.target.value || null, piece: null })
            }
          >
            <option value="">All categories</option>
            {(categories.data ?? [])
              .filter((category) => !category.parent_id)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name_en}
                </option>
              ))}
          </select>

          <select
            className="console-select"
            aria-label="Piece"
            value={productId}
            disabled={products.loading}
            onChange={(event) => setQuery({ piece: event.target.value || null })}
          >
            <option value="">All pieces</option>
            {piecesInScope.map((piece) => (
              <option key={piece.id} value={piece.id}>
                {piece.title_en}
              </option>
            ))}
          </select>

          {query.scope.categoryId || query.scope.productId ? (
            <button type="button" className="console-btn console-btn-sm" onClick={() => setQuery({ cat: null, piece: null })}>
              Whole shop
            </button>
          ) : null}
        </>
      ),
    },
  ];

  return (
    <ControlStrip
      groups={groups}
      trailing={
        <Segmented
          options={[
            { value: "today" as const, label: "Today" },
            { value: "make" as const, label: "What to make" },
          ]}
          value={view}
          onChange={(next) => {
            if (next === view) return;
            // Carry the strip across — switching face is a change of question,
            // not a reason to lose the period and scope already chosen.
            const search = params.toString();
            router.push(`${next === "make" ? "/admin/make" : "/admin"}${search ? `?${search}` : ""}`);
          }}
          ariaLabel="Board view"
        />
      }
    />
  );
}

/**
 * Marks a block that could not honour a narrowed scope.
 *
 * The alternative is worse than useless: shop-wide figures sitting silently
 * under a heading that says "Vortex Lamp" are read as being about the lamp.
 */
export function ShopWide({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="console-shopwide" title="This block is about the whole shop — it cannot narrow to the chosen scope.">
      whole shop
    </span>
  );
}
