/**
 * Telling the store what someone is doing.
 *
 * Batched and flushed on a timer, because a page of 24 cards produces 24
 * impressions and 24 requests from a phone on mobile data is not acceptable.
 * The last flush uses `keepalive` so a visitor who closes the tab still counts.
 */
import { api } from "./api";
import type { Lang } from "./i18n";

type SignalType =
  | "impression"
  | "click"
  | "dwell"
  | "scroll_depth"
  | "search"
  | "add_to_cart"
  | "purchase";

interface Pending {
  type: SignalType;
  product_id?: string;
  query?: string;
  value?: number;
}

const FLUSH_AFTER_MS = 4000;
const MAX_PENDING = 40;

let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let language: Lang = "en";
let listening = false;

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  try {
    await api.signals(language, batch);
  } catch {
    // Losing a signal is not worth showing anyone an error. The feed degrades
    // gracefully; a red banner over a shop does not.
  }
}

export function setSignalLanguage(lang: Lang): void {
  language = lang;
}

export function track(signal: Pending): void {
  // An impression for a card already counted this page-view is noise.
  if (
    signal.type === "impression" &&
    queue.some((item) => item.type === "impression" && item.product_id === signal.product_id)
  ) {
    return;
  }
  queue.push(signal);

  if (!listening && typeof document !== "undefined") {
    listening = true;
    // Not `unload`: it does not fire reliably on mobile Safari.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flush();
    });
  }

  if (queue.length >= MAX_PENDING) {
    void flush();
    return;
  }
  timer ??= setTimeout(() => void flush(), FLUSH_AFTER_MS);
}

/** Seconds a page was actually looked at, reported when leaving it. */
export function trackDwell(productId: string, startedAt: number): void {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  if (seconds > 1) track({ type: "dwell", product_id: productId, value: seconds });
  void flush();
}
