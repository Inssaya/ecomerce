/**
 * The owner's session.
 *
 * Ported from the deleted `lib/admin.ts` — the design was already correct and
 * only needed to move: the access token lives in sessionStorage, not a cookie,
 * because this is one person on their own phone and a token that dies with the
 * tab is one less thing to leak. It expires after an hour, so the refresh
 * token sits beside it and is spent automatically — otherwise the panel would
 * throw the owner back to the sign-in form mid-quote, and the day is long.
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

/** One renewal at a time. The panel fires several requests at once when a tab
 *  opens, and without this they would each spend a refresh token — which the
 *  server rotates, so all but one of them would be spending a dead one. */
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

/**
 * Thrown back to the sign-in form from wherever a page happened to be.
 *
 * `call()` already clears the stored tokens before throwing `NotSignedIn`, so
 * a reload is enough — `AdminShell`'s own mount check finds no token and
 * shows the sign-in form. Simple, and correct for a panel one person opens a
 * few times a day; a page-level event bus would be solving a problem this
 * screen does not have.
 */
export function bounceToSignIn(): void {
  if (typeof window !== "undefined") window.location.reload();
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

export async function call<T>(
  path: string,
  init: RequestInit = {},
  mayRenew = true,
): Promise<T> {
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
    // replay. 403 is the server saying no to *this* account, and no amount of
    // fresh tokens changes that.
    if (mayRenew && response.status === 401 && (await renew())) {
      return call<T>(path, init, false);
    }
    forgetSession();
    throw new NotSignedIn();
  }
  if (!response.ok) throw new Error(await problemFrom(response));
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
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

/**
 * Leave properly.
 *
 * Clearing sessionStorage only removes the tokens from this browser; the
 * refresh token stays valid on the server for thirty days, so anything that
 * got a copy of it could still mint access tokens long after the owner
 * thought they had signed out. `/auth/logout` revokes it. The local clear
 * happens first and unconditionally: whatever the network says, pressing sign
 * out signs you out of this phone.
 */
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
