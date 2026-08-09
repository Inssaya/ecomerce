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

import { readSession, writeSession, type Session } from "./session-store";

export type { Session };

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as T;
}

interface AuthReply {
  access_token: string;
  user?: { full_name?: string; email?: string; avatar_url?: string | null };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const reply = await post<AuthReply>("/auth/login", { email, password });
  const session: Session = {
    token: reply.access_token,
    name: reply.user?.full_name || email.split("@")[0],
    email: reply.user?.email || email,
    avatar: reply.user?.avatar_url ?? null,
  };
  writeSession(session);
  return session;
}

export async function signUp(
  fullName: string,
  email: string,
  password: string,
): Promise<Session> {
  await post<unknown>("/auth/register", { full_name: fullName, email, password });
  return signIn(email, password);
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
