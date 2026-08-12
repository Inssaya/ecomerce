/**
 * The number the customer reads, against the number the courier asks for.
 *
 * This shop takes cash at the door. A delivery fee that differs by ten dirhams
 * between the cart and the doorstep is not a rounding error, it is a refused
 * package — the single most expensive event in this market, and the one the
 * owner's panel has a whole screen for. So what is pinned here is not the
 * arithmetic for its own sake: it is that this file computes the same answer
 * the server does, by the same rule, including the matching of a city somebody
 * typed by hand.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { alwaysFree, feeFor, loadDelivery, matchCity, type Delivery } from "./delivery";
import type { Place } from "./api";

const place = (over: Partial<Place> = {}): Place => ({
  slug: "casablanca",
  name: "Casablanca",
  name_en: "Casablanca",
  region: "on the coast",
  delivery_days: [1, 2],
  delivery_fee: 30,
  free_delivery_over: 500,
  ...over,
});

const terms = (over: Partial<Delivery> = {}): Delivery => ({
  fee: 30,
  freeOver: 500,
  cities: [
    place(),
    place({ slug: "dakhla", name: "Dakhla", name_en: "Dakhla", delivery_fee: 75 }),
  ],
  ...over,
});

describe("what delivery costs", () => {
  it("charges what that city actually costs, not a flat guess", () => {
    // The City model carries an override "where a city genuinely costs more to
    // reach". The cart used to hold `const DELIVERY_FEE = 30` and know nothing
    // about it.
    expect(feeFor(120, terms(), "Dakhla")).toBe(75);
    expect(feeFor(120, terms(), "Casablanca")).toBe(30);
  });

  it("charges the shop's own fee for a town we have not named", () => {
    // Checkout takes free text on purpose — a dropdown missing someone's town
    // loses the order. Somewhere unnamed is not refused, just ordinary.
    expect(feeFor(120, terms(), "Ait Ourir")).toBe(30);
    expect(feeFor(120, terms(), "")).toBe(30);
    expect(feeFor(120, terms())).toBe(30);
  });

  it("gives free delivery precedence over an expensive city", () => {
    // The threshold is the promise; the fee is a detail underneath it.
    expect(feeFor(500, terms(), "Dakhla")).toBe(0);
    expect(feeFor(1200, terms(), "Dakhla")).toBe(0);
    expect(feeFor(499, terms(), "Dakhla")).toBe(75);
  });

  it("costs nothing anywhere once the threshold is zero", () => {
    // The shop's live policy: free on everything. A threshold of zero is
    // cleared by every basket, so an expensive city's own override — left in
    // the database from the days of paid delivery — must never reach a total.
    const free = terms({ fee: 0, freeOver: 0 });
    expect(alwaysFree(free)).toBe(true);
    expect(feeFor(0, free)).toBe(0);
    expect(feeFor(40, free, "Dakhla")).toBe(0);
    expect(feeFor(40, free, "Ait Ourir")).toBe(0);

    // And the wording is not "free over 0" — there is no threshold to name.
    expect(alwaysFree(terms())).toBe(false);
  });

  it("matches a city however a person typed it", () => {
    const cities = terms().cities;
    for (const typed of ["Casablanca", "casablanca", "  CASABLANCA  "]) {
      expect(matchCity(cities, typed)?.slug, typed).toBe("casablanca");
    }
    expect(matchCity(cities, "Casa")).toBeNull();
    expect(matchCity(cities, "")).toBeNull();
    expect(matchCity(cities, null)).toBeNull();
  });

  it("matches the Arabic name as written, not a transliteration", () => {
    const cities = [place({ name: "الدار البيضاء" })];
    expect(matchCity(cities, "الدار البيضاء")?.slug).toBe("casablanca");
  });
});

describe("asking the shop for its terms", () => {
  const fetchMock = vi.fn();

  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => vi.unstubAllGlobals());

  function reply(body: unknown, ok = true) {
    fetchMock.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body });
  }

  it("asks once and reuses the answer for the rest of the tab", async () => {
    reply({ items: [place()], default: { delivery_fee: 30, free_delivery_over: 500 } });
    const first = await loadDelivery("en");
    const second = await loadDelivery("en");

    expect(first.fee).toBe(30);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failure as the answer", async () => {
    // One bad moment on a phone in a lift must not cost the shop every price
    // on the page for the rest of the session.
    reply({ detail: "no" }, false);
    await expect(loadDelivery("ar")).rejects.toBeTruthy();

    reply({ items: [], default: { delivery_fee: 40, free_delivery_over: 600 } });
    await expect(loadDelivery("ar")).resolves.toMatchObject({ fee: 40, freeOver: 600 });
  });
});
