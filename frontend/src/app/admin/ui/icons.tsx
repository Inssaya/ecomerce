/**
 * The console's icons — inline SVG on a 24-grid, stroked, never filled.
 *
 * Hand-drawn rather than pulled from a package: the console needs about
 * twenty glyphs and a dependency to draw twenty glyphs is a dependency to
 * keep patched forever. Emoji are not icons — they render differently on
 * every platform, carry no stroke weight, and cannot take `currentColor`.
 */
import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "board"
  | "orders"
  | "assistant"
  | "manage"
  | "search"
  | "phone"
  | "whatsapp"
  | "close"
  | "chevron-up"
  | "chevron-down"
  | "chevron-right"
  | "arrow-right"
  | "plus"
  | "check"
  | "alert"
  | "info"
  | "image"
  | "trash"
  | "edit"
  | "external"
  | "sun"
  | "moon"
  | "logout"
  | "refresh"
  | "eye"
  | "eye-off"
  | "clock"
  | "tag"
  | "shield";

const PATHS: Record<IconName, ReactElement> = {
  board: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  orders: <><path d="M4 6h16M4 12h16M4 18h10" /></>,
  assistant: <><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" /></>,
  manage: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  phone: <><path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 6.2 2 2 0 0 1 6 4Z" /></>,
  whatsapp: <><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5Z" /><path d="M8.6 9.2c.3 2.6 2.6 4.9 5.2 5.2l1-1.3 1.8.8v1.4c-3.4.4-7.1-3.3-6.7-6.7h1.4l.8 1.8Z" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  "chevron-up": <><path d="m6 14 6-6 6 6" /></>,
  "chevron-down": <><path d="m6 10 6 6 6-6" /></>,
  "chevron-right": <><path d="m10 6 6 6-6 6" /></>,
  "arrow-right": <><path d="M4 12h15M13 6l6 6-6 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  check: <><path d="m5 13 4 4L19 7" /></>,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17.5v.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m4 17 5-5 4 4 3-2 4 4" /></>,
  trash: <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m14 5 4 4" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>,
  moon: <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></>,
  logout: <><path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3" /><path d="M10 8 6 12l4 4M6 12h10" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></>,
  eye: <><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  "eye-off": <><path d="M4 4l16 16" /><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 6 10 6a17 17 0 0 1-3.3 3.9M6.3 7.8C3.6 9.4 2 12 2 12s3.6 6 10 6a9.8 9.8 0 0 0 3.5-.6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  tag: <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 5 3.2 8 7.5 9 4.3-1 7.5-4 7.5-9V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>,
};

export function Icon({
  name,
  size = 18,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
