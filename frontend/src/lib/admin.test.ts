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
