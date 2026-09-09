"use client";

/**
 * The shopper's own account.
 *
 * Buying still never requires one — checkout takes a name, a phone and an
 * address, and that is deliberate. An account buys two things: a returning
 * customer never types their address again, and the owner gets the console.
 *
 * **Supabase holds the identity now.** It owns the password, the confirmation
 * and reset mail, and the token — including renewing it, which this module
 * used to do by hand and mostly did not.
 *
 * What is kept here is a small mirror of the current session, because the
 * rest of the app reads it synchronously: `lib/api.ts` attaches the bearer to
 * every request and cannot await a promise to do it. So the token is copied
 * into local storage whenever Supabase says it changed, and `role` — which
 * Supabase knows nothing about — is fetched once from the shop's `/auth/me`.
 *
 * The role is deliberately not a Supabase claim. Who may open the console is
 * this business's decision, and reading it from a dashboard field would mean
 * whoever can edit that dashboard can grant themselves the console.
 */
import { useCallback, useEffect, useState } from "react";

import { api, ApiError, type AuthProfile } from "./api";
import { isLang, type Lang } from "./i18n";
import { readSession, writeSession, type Session } from "./session-store";
import { supabase } from "./supabase";

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

/** The shop's own view of the account, in the shape this app stores. */
function sessionFrom(token: string, user: Profile | undefined, email: string): Session {
  return {
    token,
    role: user?.role ?? null,
    name: user?.full_name || email.split("@")[0],
    email: user?.email || email,
    avatar: user?.avatar_url ?? null,
    phone: user?.phone ?? null,
    address: user?.address_line1 ?? null,
    city: user?.city ?? null,
  };
}

/** Signed up, but there is no session until the emailed link is clicked. */
export class NeedsEmailConfirmation extends Error {
  constructor() {
    super("Check your email to confirm the account");
  }
}

/**
 * Turn a Supabase token into a shop session.
 *
 * Both halves are needed: Supabase says the token is valid and who it belongs
 * to, and `/auth/me` says what that person is *here* — their role, their
 * delivery address, the language to write to them in. That second call is
 * also what creates the shop's row for a brand-new account, on its first
 * authenticated request.
 */
async function adopt(token: string, email: string): Promise<Session> {
  // Written before the profile call, because `request()` reads this store to
  // build the Authorization header and would otherwise send none.
  writeSession(sessionFrom(token, undefined, email));
  try {
    const profile = await api.me(currentLang());
    const session = sessionFrom(token, profile, email);
    writeSession(session);
    return session;
  } catch (error) {
    // The token is good but the shop could not be reached. Keep the session
    // rather than dropping it: a missing role only means "not the owner", and
    // signing somebody out because one call blipped is the worse failure.
    if (!(error instanceof ApiError)) return sessionFrom(token, undefined, email);
    throw error;
  }
}

export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new ApiError(error.status ?? 400, error.message);
  if (!data.session) throw new ApiError(400, "That sign-in did not return a session");
  return adopt(data.session.access_token, data.user?.email ?? email);
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
  const { data, error } = await supabase.auth.signUp({
    email: details.email,
    password: details.password,
    options: {
      // Carried into the token's `user_metadata`, which the shop reads when it
      // creates the local row on the first authenticated request — so a new
      // account already knows its own name and phone.
      data: {
        full_name: details.fullName,
        phone: details.phone ?? "",
        lang: currentLang(),
      },
    },
  });
  if (error) throw new ApiError(error.status ?? 400, error.message);

  // With email confirmation on, Supabase creates the account but issues no
  // session until the link is clicked. That is not a failure and must not be
  // reported as one — the caller says "check your inbox" instead.
  if (!data.session) throw new NeedsEmailConfirmation();

  const session = await adopt(data.session.access_token, details.email);
  // The address is the shop's own field, not Supabase's, so it is saved once
  // the account exists here rather than sent along with the sign-up.
  if (details.address || details.city) {
    await saveProfile({ address_line1: details.address, city: details.city });
  }
  return session;
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

export async function signOut(): Promise<void> {
  writeSession(null);
  try {
    await supabase.auth.signOut();
  } catch {
    /* the local session is already gone, which is what signs this browser out */
  }
}

/**
 * Keep the stored token in step with Supabase's own.
 *
 * Supabase renews in the background, and the renewed token is the one every
 * later request must carry. Without this the mirror would hold the original
 * until it expired and then start failing — which is the bug the storefront
 * already had once, when it threw its refresh token away.
 */
export function watchAuth(): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, next) => {
    if (event === "SIGNED_OUT" || !next) {
      if (readSession()) writeSession(null);
      return;
    }
    const current = readSession();
    if (current && current.token !== next.access_token) {
      writeSession({ ...current, token: next.access_token });
    }
  });
  return () => data.subscription.unsubscribe();
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
