"use client";

/**
 * The console's component set.
 *
 * One Card, one Button, one Pill, one Table, one Drawer. Every screen
 * composes these; nothing hand-rolls a className string. The old panel's
 * spacing and radii never agreed page to page because there was nothing
 * like this to agree with.
 */
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Icon, type IconName } from "./icons";

// ── Buttons ──────────────────────────────────────────────────────────────────

type Variant = "default" | "primary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  default: "console-btn",
  primary: "console-btn console-btn-primary",
  ghost: "console-btn console-btn-ghost",
  danger: "console-btn console-btn-danger",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "md" | "sm";
  icon?: IconName;
  iconOnly?: boolean;
  block?: boolean;
}

export function Button({
  variant = "default",
  size = "md",
  icon,
  iconOnly,
  block,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    VARIANT[variant],
    size === "sm" ? "console-btn-sm" : "",
    iconOnly ? "console-btn-icon" : "",
    block ? "console-btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} {...rest}>
      {icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "default",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: "md" | "sm"; icon?: IconName }) {
  const classes = [VARIANT[variant], size === "sm" ? "console-btn-sm" : "", className].filter(Boolean).join(" ");
  return (
    <a className={classes} {...rest}>
      {icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
    </a>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export function Card({
  children,
  pad = "md",
  flush,
  className = "",
}: {
  children: ReactNode;
  pad?: "md" | "sm";
  flush?: boolean;
  className?: string;
}) {
  return (
    <section
      className={["console-card", pad === "sm" ? "pad-sm" : "", flush ? "flush" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </section>
  );
}

/** A card's own heading. This is NOT a page title — pages have none. */
export function CardHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="console-card-head">
      <div className="console-stack-sm" style={{ gap: 3 }}>
        <h2 className="console-h2">{title}</h2>
        {sub ? <p className="console-card-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="console-row" style={{ gap: 8, flex: "none" }}>{actions}</div> : null}
    </header>
  );
}

// ── The control strip — the page's only chrome ───────────────────────────────

export function ControlStrip({
  groups,
  trailing,
}: {
  groups: { label: string; controls: ReactNode }[];
  trailing?: ReactNode;
}) {
  return (
    <div className="console-strip">
      {groups.map((group) => (
        <div key={group.label} className="console-strip-group">
          <span className="console-strip-label">{group.label}</span>
          <div className="console-strip-controls">{group.controls}</div>
        </div>
      ))}
      {trailing ? <div className="console-strip-trailing">{trailing}</div> : null}
    </div>
  );
}

/**
 * The header: filters · search · pages.
 *
 * The strip above groups controls under labels, which suits a page that is
 * mostly one big control panel. This is the other shape — three fixed zones
 * reading left to right, no labels, no page title. Both exist while pages
 * move across; `ControlStrip` is not going anywhere until the last one has.
 *
 * A page with nothing to filter passes no `filters` at all, and the zone is
 * gone rather than empty.
 */
export function ConsoleHeader({
  filters,
  search,
  pages,
  trailing,
}: {
  filters?: ReactNode;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string; ariaLabel?: string };
  pages: { href: string; label: string; active?: boolean }[];
  trailing?: ReactNode;
}) {
  return (
    <div className="console-header">
      {filters ? <div className="console-header-filters">{filters}</div> : null}

      {search ? (
        <div className="console-header-search">
          <SearchInput
            value={search.value}
            onChange={search.onChange}
            placeholder={search.placeholder ?? "Search"}
            ariaLabel={search.ariaLabel ?? "Search"}
          />
        </div>
      ) : null}

      {/* Deliberately the segmented control's own classes rather than a new
          look: these are the same "pick one of three" the console already
          has, and they are links so each page stays a real URL. */}
      <nav className="console-header-pages console-segmented" aria-label="Pages">
        {pages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className={`console-segmented-option${page.active ? " active" : ""}`}
            aria-current={page.active ? "page" : undefined}
          >
            {page.label}
          </Link>
        ))}
      </nav>

      {trailing ? <div className="console-header-trailing">{trailing}</div> : null}
    </div>
  );
}

export interface DateRange {
  from: string;
  to: string;
}

/**
 * From and to, as one control.
 *
 * `null` means the whole history, which is the useful default for a
 * catalogue — a shop with forty pieces does not want its list to open
 * showing the four made this month.
 */
export function DateRangeFilter({
  value,
  onChange,
  ariaLabel = "Date range",
}: {
  value: DateRange | null;
  onChange: (value: DateRange | null) => void;
  ariaLabel?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const from = value?.from ?? "";
  const to = value?.to ?? "";

  // One end on its own is not a range. Until both are set the filter stays
  // off rather than silently meaning "since then".
  const settle = (nextFrom: string, nextTo: string) =>
    onChange(nextFrom && nextTo ? { from: nextFrom, to: nextTo } : null);

  return (
    <span className="console-range" role="group" aria-label={ariaLabel}>
      <input
        type="date"
        className="console-date"
        value={from}
        max={to || today}
        aria-label="From"
        onChange={(event) => settle(event.target.value, to)}
      />
      <span>→</span>
      <input
        type="date"
        className="console-date"
        value={to}
        min={from || undefined}
        max={today}
        aria-label="To"
        onChange={(event) => settle(from, event.target.value)}
      />
      {value ? <Button size="sm" iconOnly icon="close" aria-label="Clear the dates" onClick={() => onChange(null)} /> : null}
    </span>
  );
}

/** A colour, shown as a colour. Falls back to the label when there is no hex. */
export function Swatch({ hex, label }: { hex?: string | null; label?: string }) {
  if (!hex) return null;
  return <span className="console-swatch" style={{ background: hex }} title={label ?? hex} aria-hidden />;
}

// ── Pills ────────────────────────────────────────────────────────────────────

export type Tone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

export function Pill({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`console-pill console-pill-${tone}`} title={title}>
      {children}
    </span>
  );
}

// ── Value display — numeral rules live here, not at call sites ───────────────

/** Prices read as "180 MAD". Latin numerals, always, in both languages. */
export function Money({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={className}>—</span>;
  return <span className={`console-num ${className}`}>{Math.round(value).toLocaleString("en-US")} MAD</span>;
}

export function Num({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className={className}>—</span>;
  return <span className={`console-num ${className}`}>{value.toLocaleString("en-US")}</span>;
}

/** A percentage that refuses to invent itself out of an empty denominator. */
export function Ratio({ part, whole, digits = 1 }: { part: number; whole: number; digits?: number }) {
  if (!whole) return <span>—</span>;
  return <span className="console-num">{((part / whole) * 100).toFixed(digits)}%</span>;
}

/** "3d" · "2h" · "just now" — an age you can scan down a column. */
export function Age({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span>—</span>;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return <span>—</span>;
  const minutes = Math.round(ms / 60_000);
  const label =
    minutes < 1 ? "now" : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
  return (
    <time className="console-num" dateTime={iso} title={new Date(iso).toLocaleString()}>
      {label}
    </time>
  );
}

/**
 * Text that may be Arabic, inside an English console.
 *
 * Without `dir="auto"` an Arabic title renders with its punctuation on the
 * wrong side and mixed strings reorder — "حامل كتب (2)" breaks.
 */
export function Text({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span dir="auto" className={className}>
      {children}
    </span>
  );
}

/** Clamp long visitor-authored text; the full value is one click away. */
export function Clamp({ children, lines = 2 }: { children: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const long = children.length > 160;
  return (
    <span>
      <span
        dir="auto"
        style={
          open || !long
            ? undefined
            : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }
        }
      >
        {children}
      </span>
      {long ? (
        <button type="button" onClick={() => setOpen((was) => !was)} className="console-muted" style={{ textDecoration: "underline", textUnderlineOffset: 3, marginInlineStart: 6 }}>
          {open ? "less" : "more"}
        </button>
      ) : null}
    </span>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  caption,
  help,
  delta,
  href,
  onClick,
  children,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  help?: ReactNode;
  delta?: { value: number; suffix?: string };
  href?: string;
  onClick?: () => void;
  /** A sparkline under the value — shape, where the tile carries the number. */
  children?: ReactNode;
}) {
  const body = (
    <>
      <span className="console-stat-label">
        <span className="console-caps">{label}</span>
        {help}
      </span>
      <span className="console-metric">{value}</span>
      {delta && delta.value !== 0 ? (
        <span className={`console-delta ${delta.value > 0 ? "up" : "down"}`}>
          {delta.value > 0 ? "+" : ""}
          {Math.round(delta.value).toLocaleString("en-US")}
          {delta.suffix ?? ""}
        </span>
      ) : null}
      {caption ? <span className="console-stat-caption">{caption}</span> : null}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="console-stat">
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="console-stat">
        {body}
      </button>
    );
  }
  return <div className="console-stat">{body}</div>;
}

export function HelpToggle({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-label={label} className="console-help">
      ?
    </button>
  );
}

// ── Segmented · chips ────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="console-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`console-segmented-option${value === option.value ? " active" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="console-chip-row">
      {options.map((option) => (
        <button
          key={option.value || "__all__"}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`console-chip${value === option.value ? " active" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Fields ───────────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="console-field">
      <label className="console-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <span className="console-field-error">{error}</span> : hint ? <span className="console-field-hint">{hint}</span> : null}
    </div>
  );
}

/** An Arabic input. RTL, so what you type reads the way it will be shown. */
export function ArabicInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input dir="rtl" lang="ar" {...props} />;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div className="console-search">
      <Icon name="search" size={16} />
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel} />
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

export interface Column<Row> {
  key: string;
  header: string;
  align?: "right";
  sortable?: boolean;
  width?: number | string;
  render: (row: Row) => ReactNode;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  sort,
  onSort,
  empty,
  minWidth = 640,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  selectedKey?: string | null;
  sort?: { key: string; asc: boolean };
  onSort?: (key: string) => void;
  empty?: ReactNode;
  minWidth?: number;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="console-table-wrap">
      <table className="console-table sticky" style={{ minWidth }}>
        <thead>
          <tr>
            {columns.map((column) => {
              const canSort = Boolean(column.sortable && onSort);
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={[column.align === "right" ? "align-right" : "", canSort ? "sortable" : ""].filter(Boolean).join(" ")}
                  // Announced, not just drawn: a caret is invisible to a screen
                  // reader, and without this the sort order is a visual-only fact.
                  aria-sort={!canSort ? undefined : active ? (sort!.asc ? "ascending" : "descending") : "none"}
                >
                  {canSort ? (
                    // A button, not a clickable <th> — the header has to be
                    // reachable by keyboard, and a bare onClick on a cell is not.
                    <button type="button" className="console-th-sort" onClick={() => onSort!(column.key)}>
                      {column.header}
                      <span className="caret" aria-hidden>
                        {active ? (sort!.asc ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={[onRowClick ? "clickable" : "", selectedKey === key ? "selected" : ""].filter(Boolean).join(" ")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={column.align === "right" ? "align-right" : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Client-side sorting for a table that already holds all its rows.
 *
 * Every leaderboard on the Board is a complete list the server already
 * ranked and sent — sorting it is a question about data in the browser,
 * not a new request. (Doors that page their rows need a server sort
 * instead; this hook would silently sort only the visible page.)
 *
 * Clicking a new column starts descending, because on every column here
 * — revenue, units, views — the interesting end is the top.
 */
export function useTableSort<Row>(
  rows: Row[],
  values: Record<string, (row: Row) => number | string>,
  initial: { key: string; asc: boolean },
) {
  const [sort, setSort] = useState(initial);

  const sorted = useMemo(() => {
    const read = values[sort.key];
    if (!read) return rows;
    const direction = sort.asc ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = read(left);
      const b = read(right);
      if (typeof a === "string" || typeof b === "string") {
        return String(a).localeCompare(String(b), undefined, { numeric: true }) * direction;
      }
      return (a - b) * direction;
    });
    // `values` is rebuilt every render at most call sites; the keys are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  const onSort = useCallback((key: string) => {
    setSort((current) => (current.key === key ? { key, asc: !current.asc } : { key, asc: false }));
  }, []);

  return { sorted, sort, onSort };
}

/** A bar behind a number, for comparing down a column. */
export function MicroBar({ value, of, children }: { value: number; of: number; children: ReactNode }) {
  const pct = of > 0 ? Math.min(100, (value / of) * 100) : 0;
  return (
    <span className="console-microbar">
      <span className="console-microbar-fill" style={{ width: `${pct}%` }} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

// ── Overlays — detail over the list, never a separate page ───────────────────

/**
 * Where anything that floats has to be portalled.
 *
 * The target is the `.console` root, NOT document.body. Every rule in
 * console.css is scoped under `.console`, so an overlay portalled to the body
 * escapes the entire stylesheet and renders as raw unstyled text. This is the
 * single most repeated mistake in this codebase, so it is a named hook rather
 * than a comment copied into each overlay.
 */
function useConsoleHost(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.querySelector<HTMLElement>(".console")), []);
  return host;
}

/** Escape closes it, and the page beneath it stops scrolling. */
function useOverlayKeys(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
}

export function Drawer({
  open,
  title,
  sub,
  actions,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const host = useConsoleHost();
  useOverlayKeys(open, onClose);

  if (!open || !host) return null;

  return createPortal(
    <>
      <div className="console-scrim" onClick={onClose} aria-hidden />
      <aside className="console-drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Detail"}>
        <header className="console-drawer-head">
          <div className="console-stack-sm" style={{ gap: 3 }}>
            <h2 className="console-h2">{title}</h2>
            {sub ? <p className="console-card-sub">{sub}</p> : null}
          </div>
          <Button variant="ghost" iconOnly size="sm" icon="close" onClick={onClose} aria-label="Close" />
        </header>
        {/* Actions sit above the scroll, so they never end up off-screen. */}
        {actions ? <div className="console-drawer-actions">{actions}</div> : null}
        <div className="console-drawer-body">{children}</div>
      </aside>
    </>,
    host,
  );
}

/**
 * A record, centred, with room to work in.
 *
 * The drawer is 560px against the side and suits reading one order. Editing a
 * piece — photos, both languages, price, and a list of measures and colours —
 * needs the width, and needs to feel like the thing you are working on rather
 * than a panel beside the thing you were working on.
 */
export function Popup({
  open,
  title,
  sub,
  actions,
  onClose,
  width = 940,
  children,
}: {
  open: boolean;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  /** Wide by default. A confirmation-sized popup should be a confirm. */
  width?: number;
  children: ReactNode;
}) {
  const host = useConsoleHost();
  useOverlayKeys(open, onClose);

  if (!open || !host) return null;

  return createPortal(
    <div
      className="console-popup-wrap"
      // Clicking the backdrop closes; clicking inside it must not. Checking
      // the target rather than stopping propagation in the panel keeps text
      // selection that ends outside the panel from closing it.
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="console-popup"
        style={{ ["--popup-w" as string]: `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Detail"}
      >
        <header className="console-popup-head">
          <div className="console-stack-sm" style={{ gap: 3 }}>
            <h2 className="console-h2">{title}</h2>
            {sub ? <p className="console-card-sub">{sub}</p> : null}
          </div>
          <Button variant="ghost" iconOnly size="sm" icon="close" onClick={onClose} aria-label="Close" />
        </header>
        {actions ? <div className="console-popup-actions">{actions}</div> : null}
        <div className="console-popup-body">{children}</div>
      </div>
    </div>,
    host,
  );
}

// ── Confirm — sized to consequence ───────────────────────────────────────────

export interface ConfirmRequest {
  title: string;
  /** Say what will actually happen, naming the customer where there is one. */
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Returns whatever it likes — the result is awaited and discarded. */
  onConfirm: () => unknown | Promise<unknown>;
}

const ConfirmContext = createContext<(request: ConfirmRequest) => void>(() => {});

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = useCallback((next: ConfirmRequest) => setRequest(next), []);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request ? (
        <div className="console-modal-wrap" onClick={() => !busy && setRequest(null)}>
          <div className="console-modal" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2 className="console-h2">{request.title}</h2>
            <div style={{ fontSize: "var(--t-md)", lineHeight: 1.6, color: "var(--ink2)" }}>{request.body}</div>
            <div className="console-modal-actions">
              <Button
                variant={request.danger ? "danger" : "primary"}
                block
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request.onConfirm();
                    setRequest(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Working…" : request.confirmLabel}
              </Button>
              <Button block disabled={busy} onClick={() => setRequest(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

// ── Dirty-form guard ─────────────────────────────────────────────────────────

/**
 * A drawer is easy to dismiss by accident. Anything with unsaved edits
 * intercepts closing, navigating away and reloading.
 */
export function useDirtyGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  return useCallback(
    (proceed: () => void) => {
      if (!dirty || window.confirm("You have unsaved changes. Leave without saving?")) proceed();
    },
    [dirty],
  );
}

// ── States ───────────────────────────────────────────────────────────────────

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="console-empty">
      <p className="console-empty-title">{title}</p>
      {hint ? <p className="console-empty-hint">{hint}</p> : null}
      {action}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="console-row">
      <p className="console-error" style={{ flex: 1, minWidth: 200 }}>
        {message}
      </p>
      <Button size="sm" icon="refresh" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function Skeleton({ height = 160 }: { height?: number }) {
  return <div className="console-skeleton" style={{ height }} aria-hidden />;
}

/** Wraps content that is refreshing: it dims in place rather than flashing. */
export function Stale({ stale, children }: { stale: boolean; children: ReactNode }) {
  return <div className={stale ? "console-stale" : undefined}>{children}</div>;
}

// ── Small helpers ────────────────────────────────────────────────────────────

/** A debounced mirror of a value — for search boxes that hit the server. */
export function useDebounced<T>(value: T, ms = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export { Icon, Link, useId, useMemo, useRef };
export type { IconName };
