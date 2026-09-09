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

export function ownerToken(): string | null {
  return readSession()?.token ?? null;
}

/** True only for the account that may open the console. */
export function isOwner(): boolean {
  return readSession()?.role === "owner";
}

function keepSession(body: { access_token: string; refresh_token?: string }): void {
  const current = readSession();
  if (!current) return;
  writeSession({
    ...current,
    token: body.access_token,
    refresh: body.refresh_token ?? current.refresh ?? null,
  });
}

function forgetSession(): void {
  writeSession(null);
}

/** One renewal at a time. Several requests can fire on mount, and the server
 *  rotates refresh tokens — without this, all but one would spend a dead one. */
let renewing: Promise<boolean> | null = null;

function renew(): Promise<boolean> {
  renewing ??= (async () => {
    const token = readSession()?.refresh ?? null;
    if (!token) return false;
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: token }),
      });
      if (!response.ok) return false;
      keepSession(await response.json());
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

/** Clearing the stored session only signs this browser out; the refresh token
 *  stays valid on the server for thirty days, so `/auth/logout` revokes it.
 *  The local clear happens first and unconditionally regardless of the network. */
export async function signOut(): Promise<void> {
  const token = readSession()?.refresh ?? null;
  forgetSession();
  if (!token) return;
  await fetch("/api/auth/logout?lang=en", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: token }),
    keepalive: true,
  }).catch(() => undefined);
}

export async function changePassword(current: string, next: string): Promise<void> {
  await call<void>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: current, new_password: next }),
  });
  forgetSession();
}
