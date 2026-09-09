/**
 * The owner's session — which is now simply *the* session.
 *
 * This used to be a second, separate token in `sessionStorage`, written by a
 * sign-in page of its own at `/admin`. Two sign-ins for one shop is a thing
 * to explain rather than a thing to use: the owner had to know that signing
 * in on the storefront did not sign them into the console, and the console
 * could not tell it was already looking at an authenticated owner.
 *
 * There is one sign-in now, on the storefront, and it decides where you land
 * from the role the server returns. This module keeps its name and its job —
 * transport, renewal, sign-out — and reads the shared session instead of
 * holding one of its own.
 */
import { readSession, writeSession } from "@/lib/session-store";
import { supabase } from "@/lib/supabase";

export function ownerToken(): string | null {
  return readSession()?.token ?? null;
}

/** True only for the account that may open the console. */
export function isOwner(): boolean {
  return readSession()?.role === "owner";
}

function keepSession(accessToken: string): void {
  const current = readSession();
  if (!current) return;
  writeSession({ ...current, token: accessToken });
}

function forgetSession(): void {
  writeSession(null);
}

/**
 * One renewal at a time.
 *
 * Several console requests fire on mount, and each would otherwise ask
 * Supabase for a new token independently. Supabase does its own refreshing in
 * the background; this is the path for the case that beat it — a request that
 * came back 401 because the token expired between being read and being sent.
 *
 * The refresh token is no longer this app's to hold: it lives inside the
 * Supabase client, which rotates it. Asking for the current session is enough.
 */
let renewing: Promise<boolean> | null = null;

function renew(): Promise<boolean> {
  renewing ??= (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) return false;
      keepSession(data.session.access_token);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}

export class NotSignedIn extends Error {}

export const SIGNED_OUT_EVENT = "mostyle:signed-out";

/**
 * The session died — say so without destroying what the owner was doing.
 *
 * This used to call `window.location.reload()`. That threw away every
 * unsaved edit on the screen: a half-written quote, an edited description,
 * a filled-in batch count. The token is gone either way, but the work is
 * not, so the shell overlays sign-in on top of the live page and takes it
 * away again once the session is back. Nothing unmounts.
 */
export function bounceToSignIn(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT));
}

/** What the server said went wrong, in words a person can act on. */
async function problemFrom(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = Array.isArray(body?.detail) ? body.detail[0]?.msg : body?.detail;
    if (typeof detail === "string" && detail) return detail;
  } catch {
    /* not JSON — the status is all there is */
  }
  return `Request failed (${response.status})`;
}

export async function call<T>(path: string, init: RequestInit = {}, mayRenew = true): Promise<T> {
  const token = ownerToken();
  if (!token) throw new NotSignedIn();

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept-language", "en");
  if (init.body) headers.set("content-type", "application/json");

  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`/api${path}${separator}lang=en`, { ...init, headers });
  if (response.status === 401 || response.status === 403) {
    // 401 is an expired hour, not a refusal — try the refresh token once and
    // replay. 403 is the server saying no to *this* account, unrecoverable.
    if (mayRenew && response.status === 401 && (await renew())) {
      return call<T>(path, init, false);
    }
    forgetSession();
    throw new NotSignedIn();
  }
  if (!response.ok) throw new Error(await problemFrom(response));
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** For endpoints that take a multipart body (photo/icon uploads) — `call()`
 *  assumes JSON, so uploads bypass it but share its token/error handling. */
export async function callUpload<T>(path: string, body: FormData): Promise<T> {
  const token = ownerToken();
  if (!token) throw new NotSignedIn();
  const response = await fetch(`/api${path}${path.includes("?") ? "&" : "?"}lang=en`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body,
  });
  if (response.status === 401 || response.status === 403) {
    forgetSession();
    throw new NotSignedIn();
  }
  if (!response.ok) throw new Error(await problemFrom(response));
  return response.json() as Promise<T>;
}

/** The local clear happens first and unconditionally, so this browser is
 *  signed out even with no network; Supabase then revokes the session on its
 *  side so the other devices go too. */
export async function signOut(): Promise<void> {
  forgetSession();
  try {
    await supabase.auth.signOut();
  } catch {
    /* already signed out here, which is what the owner asked for */
  }
}

/**
 * Change the owner's password.
 *
 * Supabase owns the credential, so this no longer verifies the current one —
 * it does not have it to compare against. The account is proved by holding a
 * live session instead, which is the same guarantee the old
 * `current_password` check was standing in for.
 */
export async function changePassword(next: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw new Error(error.message);
}
