/**
 * Unsaved-work rescue.
 *
 * A failed token refresh used to call `window.location.reload()`, which
 * silently destroyed whatever the owner was typing — a half-written quote,
 * an edited description. The token is gone either way; the work does not
 * have to be.
 *
 * Privacy bounds, because these drafts hold customer data:
 *  · only the form fields needed to restore the draft, keyed by record
 *  · never passwords, never tokens, never uploaded binary
 *  · sessionStorage only, so it dies with the tab like the session does
 *  · cleared on save, on discard, and on sign-out
 */
const PREFIX = "mostyle_console_draft:";

export function saveDraft(key: string, values: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify({ values, at: Date.now() }));
  } catch {
    /* quota or private mode — a lost draft is bad, a crash is worse */
  }
}

export function readDraft<T extends Record<string, unknown>>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return (JSON.parse(raw) as { values: T }).values;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to do */
  }
}

/** Everything, on sign-out. Drafts must not outlive the session. */
export function clearAllDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    /* nothing to do */
  }
}

/** True when a draft is waiting to be restored — the shell says so. */
export function hasDrafts(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Object.keys(sessionStorage).some((key) => key.startsWith(PREFIX));
  } catch {
    return false;
  }
}
