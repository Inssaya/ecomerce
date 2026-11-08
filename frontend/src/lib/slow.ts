/**
 * Is something taking suspiciously long?
 *
 * One small store the whole storefront shares: anything that has been waiting
 * longer than it should reports itself here, and `SlowConnection` shows a
 * single quiet notice for as long as at least one of them is still waiting.
 *
 * A counter rather than a flag, because two slow things can overlap and the
 * notice must stay up until the *last* of them has finished.
 */

/** How long a wait is normal before the notice appears. Shorter than this and
 *  the popup would flash on every ordinary request. */
export const SLOW_AFTER_MS = 2500;

let waiting = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function beginSlow() {
  waiting += 1;
  emit();
}

export function endSlow() {
  waiting = Math.max(0, waiting - 1);
  emit();
}

export function subscribeSlow(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isSlow() {
  return waiting > 0;
}

/**
 * Run `work`, and report it as slow if it is still going after `SLOW_AFTER_MS`.
 *
 * Settles exactly as `work` does — the result or the error passes straight
 * through — and always un-reports itself, so a failed request cannot leave the
 * notice stuck on the screen.
 */
export async function watchSlow<T>(work: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined") return work();

  let reported = false;
  const timer = window.setTimeout(() => {
    reported = true;
    beginSlow();
  }, SLOW_AFTER_MS);

  try {
    return await work();
  } finally {
    window.clearTimeout(timer);
    if (reported) endSlow();
  }
}
