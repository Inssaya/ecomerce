"use client";

import { useEffect, useSyncExternalStore } from "react";

import { type Lang, translator } from "@/lib/i18n";
import { SLOW_AFTER_MS, beginSlow, endSlow, isSlow, subscribeSlow } from "@/lib/slow";

/**
 * A small notice for when something is taking a while.
 *
 * It says nothing about *why*. The honest reasons are many — a weak signal, a
 * busy moment, a host that was idle — and none of them is a thing a shopper can
 * act on, so the message only asks them to hold on rather than to leave or to
 * suspect the shop. It appears only after the wait has already been long enough
 * to notice, and goes away the moment it is over.
 */
export function SlowConnection({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const slow = useSyncExternalStore(subscribeSlow, isSlow, () => false);

  if (!slow) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4"
    >
      <div
        className="animate-fade flex max-w-[22rem] items-center gap-3 rounded-2xl border border-sand
                   bg-surface px-4 py-3 shadow-lg"
      >
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sand border-t-ink"
        />
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-ink">{t("slowTitle")}</span>
          <span className="block text-[12.5px] leading-snug text-ink-soft">{t("slowBody")}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Mounted by a route's loading state: if the page it stands in for is still
 * being fetched after the usual wait, report that. Unmounting — the page
 * arriving — withdraws the report.
 */
export function SlowWhileLoading() {
  useEffect(() => {
    let reported = false;
    const timer = window.setTimeout(() => {
      reported = true;
      beginSlow();
    }, SLOW_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      if (reported) endSlow();
    };
  }, []);

  return null;
}
