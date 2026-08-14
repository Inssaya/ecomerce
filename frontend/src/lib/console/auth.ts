/**
 * The owner's session.
 *
 * One person, one device at a time — the access token lives in
 * sessionStorage, not a cookie, so it dies with the tab. It expires after an
 * hour; the refresh token sits beside it and is spent automatically so the
 * console never throws the owner back to sign-in mid-task.
 */
const TOKEN_KEY = "mostyle_owner_token";
const REFRESH_KEY = "mostyle_owner_refresh";

export function ownerToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

function setOwnerToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function keepSession(body: { access_token: string; refresh_token?: string }): void {
  setOwnerToken(body.access_token);
  if (body.refresh_token) sessionStorage.setItem(REFRESH_KEY, body.refresh_token);
}

function forgetSession(): void {
  setOwnerToken(null);
  if (typeof window !== "undefined") sessionStorage.removeItem(REFRESH_KEY);
}

/** One renewal at a time. Several requests can fire on mount, and the server
 *  rotates refresh tokens — without this, all but one would spend a dead one. */
let renewing: Promise<boolean> | null = null;

function renew(): Promise<boolean> {
  renewing ??= (async () => {
    const token = typeof window === "undefined" ? null : sessionStorage.getItem(REFRESH_KEY);
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

export async function signIn(email: string, password: string): Promise<void> {
  const response = await fetch("/api/auth/login?lang=en", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Email or password is incorrect");
  const body = await response.json();
  if (body.user?.role !== "owner") throw new Error("That account is not the workshop's");
  keepSession(body);
}

/** Clearing sessionStorage only signs this browser out; the refresh token
 *  stays valid on the server for thirty days, so `/auth/logout` revokes it.
 *  The local clear happens first and unconditionally regardless of the network. */
export async function signOut(): Promise<void> {
  const token = typeof window === "undefined" ? null : sessionStorage.getItem(REFRESH_KEY);
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
