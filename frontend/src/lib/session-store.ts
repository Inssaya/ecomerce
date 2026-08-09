/**
 * Where the shopper's session is kept, with no React attached.
 *
 * Split out of `lib/session.ts` because that module is `"use client"` and
 * exports hooks: importing it from `lib/api.ts` — which every page touches —
 * would drag a client boundary along with it. The key and the two plain
 * accessors live here so both can share them without either importing the
 * other's baggage.
 */
export const SESSION_KEY = "mostyle.session";

export interface Session {
  token: string;
  name: string;
  email: string;
  avatar?: string | null;
}

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null): void {
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
  // Same-tab listeners: `storage` only fires in *other* tabs, so the bar in
  // this one would keep saying "Sign in" until a reload without this.
  window.dispatchEvent(new Event("mostyle:session"));
}

/** The bearer token, or nothing. Safe to call during a server render. */
export function sessionToken(): string | null {
  return readSession()?.token ?? null;
}
