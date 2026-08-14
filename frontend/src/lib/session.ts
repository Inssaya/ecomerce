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

import { ApiError } from "./api";
import { problemFrom } from "./detail";
import { readSession, writeSession, type Session } from "./session-store";

export type { Session };
export { ApiError };

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // The server already says exactly what went wrong — wrong password, an email
  // already registered, a password too short — and swallowing that into a bare
  // status code is what forced every failure on the sign-in form to look the
  // same.
  if (!response.ok) throw new ApiError(response.status, await problemFrom(response));
  return (await response.json()) as T;
}

export interface Profile {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  avatar_url?: string | null;
}

interface AuthReply {
  access_token: string;
  user?: Profile;
}

/** The server's own view of the account, in the shape this app stores. */
function sessionFrom(token: string, user: Profile | undefined, email: string): Session {
  return {
    token,
    name: user?.full_name || email.split("@")[0],
    email: user?.email || email,
    avatar: user?.avatar_url ?? null,
    phone: user?.phone ?? null,
    address: user?.address_line1 ?? null,
    city: user?.city ?? null,
  };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const reply = await post<AuthReply>("/auth/login", { email, password });
  const session = sessionFrom(reply.access_token, reply.user, email);
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
  await post<unknown>("/auth/register", {
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
    const response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${current.token}`,
      },
      body: JSON.stringify(changes),
    });
    if (!response.ok) return;
    const user = (await response.json()) as Profile;
    patchSession({
      phone: user.phone ?? null,
      address: user.address_line1 ?? null,
      city: user.city ?? null,
    });
  } catch {
    /* offline, or the token expired — the order is placed regardless */
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
