/**
 * The owner client, and the table that decides which buttons exist.
 *
 * `NEXT_STATUSES` is a copy of the server's transition table living in the
 * browser, and a copy is a thing that drifts. It drifted once already while
 * this screen was being written — it claimed a delivered order could be walked
 * back to `returned`, and that a failed delivery could be cancelled, neither of
 * which the server allows. The screen would have offered two buttons that
 * always fail.
 *
 * These tests pin the properties that make the copy safe rather than the exact
 * contents, so they still mean something after the shop changes its mind about
 * an ordering.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { NEXT_STATUSES, admin, ownerToken, setOwnerToken, NotSignedIn } from "./admin";

describe("the transition table the buttons come from", () => {
  it("never offers a move out of a finished order", () => {
    // Delivered, cancelled and returned are the end. A button here would be a
    // promise to a customer that the server refuses to keep.
    expect(NEXT_STATUSES.delivered).toEqual([]);
    expect(NEXT_STATUSES.cancelled).toEqual([]);
    expect(NEXT_STATUSES.returned).toEqual([]);
  });

  it("lets a failed delivery be sent again or accepted back, and nothing else", () => {
    // The courier could not hand it over. Those are the only two real
    // outcomes; "cancelled" was in this list once and the server rejects it.
    expect(new Set(NEXT_STATUSES.failed)).toEqual(new Set(["out_for_delivery", "returned"]));
  });

  it("only ever names states the shop actually has", () => {
    const known = new Set(Object.keys(NEXT_STATUSES));
    for (const [from, targets] of Object.entries(NEXT_STATUSES)) {
      for (const target of targets) {
        expect(known, `${from} → ${target}`).toContain(target);
      }
    }
  });

  it("moves an order forward without letting it loop back on itself", () => {
    for (const [from, targets] of Object.entries(NEXT_STATUSES)) {
      expect(targets, `${from} lists itself`).not.toContain(from);
    }
  });

  it("can reach delivered from a new order", () => {
    // The whole point of the screen. If this path ever breaks, no order placed
    // on the site can be completed.
    const seen = new Set<string>();
    let at = "placed";
    const path = [at];
    while (!seen.has(at)) {
      seen.add(at);
      const next = (NEXT_STATUSES[at] ?? []).find((s) => !["cancelled", "failed"].includes(s));
      if (!next) break;
      at = next;
      path.push(at);
    }
    expect(path[path.length - 1]).toBe("delivered");
  });
});

describe("talking to the API as the owner", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
    setOwnerToken("a-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  function reply(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce({
      ok: status < 400,
      status,
      json: async () => body,
    });
  }

  it("carries the token and the language on every call", async () => {
    reply([]);
    await admin.orders("en");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/admin/orders");
    expect(url).toContain("lang=en");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer a-token");
  });

  it("surfaces the server's own sentence instead of a status code", async () => {
    // This is the difference, on the screen that puts things in the shop,
    // between an instruction and a dead end.
    reply({ detail: "Add at least one photo of the piece before publishing it" }, 400);
    await expect(admin.updateProduct("en", "x", { status: "active" })).rejects.toThrow(
      "Add at least one photo of the piece before publishing it",
    );
  });

  it("treats a 401 as signed out and forgets the token", async () => {
    reply({}, 401);
    await expect(admin.orders("en")).rejects.toBeInstanceOf(NotSignedIn);
    expect(ownerToken()).toBeNull();
  });

  it("sends a quote with both a price and a real number of days", async () => {
    // Both are required by the server. A quote without a date is the vagueness
    // that gets a package refused three weeks later.
    reply({ reference: "ABC" });
    await admin.quote("en", "ABC", 140, 5, "I can match the broken one.");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ price: 140, lead_time_days: 5 });
  });

  it("asks for a period when it asks for analytics", async () => {
    reply({});
    await admin.analytics("en", 7);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/date_from=\d{4}-\d{2}-\d{2}/);
    expect(url).toMatch(/date_to=\d{4}-\d{2}-\d{2}/);
  });

  it("refuses to call anything at all without a token", async () => {
    setOwnerToken(null);
    await expect(admin.orders("en")).rejects.toBeInstanceOf(NotSignedIn);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * The session itself.
 *
 * The access token lasts an hour and the owner's day does not. Before this, the
 * panel simply dropped them at the sign-in form when the hour was up — possibly
 * mid-quote — and "Sign out" cleared the browser while leaving the refresh
 * token valid on the server for another thirty days.
 */
describe("the session", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  function reply(body: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
  }

  async function signIn() {
    reply({ access_token: "first", refresh_token: "renewal", user: { role: "owner" } });
    await admin.signIn("en", "owner@mostyle.ma", "a real password");
    fetchMock.mockClear();
  }

  it("keeps the refresh token from signing in, not only the access token", async () => {
    await signIn();
    expect(ownerToken()).toBe("first");
    expect(sessionStorage.getItem("mostyle_owner_refresh")).toBe("renewal");
  });

  it("will not sign in an account that is not the workshop's", async () => {
    reply({ access_token: "x", refresh_token: "y", user: { role: "customer" } });
    await expect(admin.signIn("en", "someone@example.com", "password")).rejects.toThrow();
    expect(ownerToken()).toBeNull();
  });

  it("renews an expired hour and replays the request, instead of signing the owner out", async () => {
    await signIn();
    reply({}, 401); // the access token aged out
    reply({ access_token: "second", refresh_token: "rotated" }); // /auth/refresh
    reply([{ reference: "7KQ4M2XP" }]); // the replay

    await expect(admin.orders("en")).resolves.toEqual([{ reference: "7KQ4M2XP" }]);

    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/refresh");
    // The replay carries the new token, and the rotated refresh token is kept —
    // the server spends the old one on every renewal.
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("authorization")).toBe(
      "Bearer second",
    );
    expect(sessionStorage.getItem("mostyle_owner_refresh")).toBe("rotated");
  });

  it("gives up once the refresh token is dead too", async () => {
    await signIn();
    reply({}, 401);
    reply({}, 401); // /auth/refresh refuses as well

    await expect(admin.orders("en")).rejects.toBeInstanceOf(NotSignedIn);
    expect(ownerToken()).toBeNull();
    expect(sessionStorage.getItem("mostyle_owner_refresh")).toBeNull();
  });

  it("does not try to renew its way past a 403", async () => {
    // 403 is the server refusing this account, not an expired hour. Renewing
    // would spend a good refresh token to be told no a second time.
    await signIn();
    reply({}, 403);
    await expect(admin.orders("en")).rejects.toBeInstanceOf(NotSignedIn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renews once when several screens hit the same expired hour", async () => {
    // The panel loads two or three things at once. Each of them spending a
    // refresh token would leave all but one holding a token the server has
    // already rotated away.
    await signIn();
    reply({}, 401);
    reply({}, 401);
    reply({ access_token: "second", refresh_token: "rotated" });
    reply([]);
    reply({});

    await Promise.all([admin.orders("en"), admin.pulse("en")]);

    const renewals = fetchMock.mock.calls.filter(([url]) => url === "/api/auth/refresh");
    expect(renewals).toHaveLength(1);
  });

  it("revokes the session on the server when the owner signs out", async () => {
    await signIn();
    reply(undefined, 204);

    await admin.signOut("en");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/auth/logout");
    expect(JSON.parse(init.body)).toEqual({ refresh_token: "renewal" });
    expect(ownerToken()).toBeNull();
    expect(sessionStorage.getItem("mostyle_owner_refresh")).toBeNull();
  });

  it("signs out of this phone even when the network is gone", async () => {
    await signIn();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(admin.signOut("en")).resolves.toBeUndefined();
    expect(ownerToken()).toBeNull();
  });

  it("drops the session after a password change, because the server revoked it", async () => {
    await signIn();
    reply(undefined, 204);

    await admin.changePassword("en", "the old one", "a much longer new one");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      current_password: "the old one",
      new_password: "a much longer new one",
    });
    expect(ownerToken()).toBeNull();
  });

  it("keeps the owner signed in when the current password was wrong", async () => {
    await signIn();
    reply({ detail: "Current password is incorrect" }, 400);

    await expect(admin.changePassword("en", "wrong", "a much longer new one")).rejects.toThrow(
      "Current password is incorrect",
    );
    expect(ownerToken()).toBe("first");
  });
});
