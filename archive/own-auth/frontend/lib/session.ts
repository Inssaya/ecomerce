"use client";

/**
 * The shopper's own account.
 *
 * Buying still never requires one — checkout takes a name, a phone and an
 * address, and that is deliberate. An account buys two things: the concierge
 * knows who it is talking to, and a returning customer can see what they have
 * bought. Orders placed while signed in are attached to the account by
 * `lib/api.ts`, which sends this token on every request.
 *
 * Separate from `lib/admin.ts` on purpose. That module holds the *owner's*
 * token for the control room; this one holds a customer's. Sharing one key
 * would mean signing in as a shopper could hand you an owner session.
 */
import { useCallback, useEffect, useState } from "react";

import { api, ApiError, type AuthProfile } from "./api";
import { isLang, type Lang } from "./i18n";
import { readSession, writeSession, type Session } from "./session-store";

export type { Session };
export { ApiError };
export type Profile = AuthProfile;

/**
 * The page's own language, for the one call site that has no `lang` of its
 * own to send — `saveProfile` runs from checkout too, which asks for no
 * language back. `lib/[lang]/layout.tsx` stamps `<html lang>` from the route
 * on every page under it, server-rendered before any client code runs, so
 * this is never a guess at what the browser prefers, only a read of what the
 * page it's called from already is.
 */
function currentLang(): Lang {
  if (typeof document === "undefined") return "en";
  const value = document.documentElement.lang;
  return isLang(value) ? value : "en";
}

/** The server's own view of the account, in the shape this app stores. */
function sessionFrom(
  token: string,
  user: Profile | undefined,
  email: string,
  refresh?: string | null,
): Session {
  return {
    token,
    refresh: refresh ?? null,
    role: user?.role ?? null,
    name: user?.full_name || email.split("@")[0],
    email: user?.email || email,
    avatar: user?.avatar_url ?? null,
    phone: user?.phone ?? null,
    address: user?.address_line1 ?? null,
    city: user?.city ?? null,
  };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const reply = await api.login(currentLang(), email, password);
  const session = sessionFrom(reply.access_token, reply.user, email, reply.refresh_token);
  writeSession(session);
  return session;
}

export async function signUp(
  details: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    address?: string;
    city?: string;
  },
): Promise<Session> {
  // Everything asked for on the sign-up form goes with the registration, so
  // that the very first checkout after making an account is already filled in.
  // Sending it on the follow-up sign-in instead would leave a window where the
  // account exists and knows nothing about the person who just typed it all.
  await api.register(currentLang(), {
    full_name: details.fullName,
    email: details.email,
    password: details.password,
    phone: details.phone || null,
    address_line1: details.address || null,
    city: details.city || null,
  });
  return signIn(details.email, details.password);
}

/**
 * Save a correction the customer made somewhere else — the checkout form, most
 * of the time — back onto the account.
 *
 * Deliberately quiet: it runs after the order is already placed, and a profile
 * that failed to update is not worth interrupting a confirmed sale to report.
 * The order itself carries the address that was actually used either way.
 */
export async function saveProfile(changes: {
  phone?: string;
  address_line1?: string;
  city?: string;
}): Promise<void> {
  const current = readSession();
  if (!current) return;
  try {
    // No explicit token to attach: `request()` reads the same stored session
    // this function does and sends it as the bearer, the same way it would for
    // any other authenticated call.
    const user = await api.updateMe(currentLang(), changes);
    patchSession({
      phone: user.phone ?? null,
      address: user.address_line1 ?? null,
      city: user.city ?? null,
    });
  } catch {
    /* offline, blocked, or the token expired — the order is placed regardless */
  }
}

export function signOut(): void {
  writeSession(null);
}

/** Update the stored copy after the profile changes — a new photograph, say. */
export function patchSession(changes: Partial<Session>): void {
  const current = readSession();
  if (current) writeSession({ ...current, ...changes });
}

/** The current session, kept in step across tabs and across this one. */
export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => setSession(readSession()), []);

  useEffect(() => {
    refresh();
    setReady(true);
    window.addEventListener("storage", refresh);
    window.addEventListener("mostyle:session", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("mostyle:session", refresh);
    };
  }, [refresh]);

  return { session, ready };
}
