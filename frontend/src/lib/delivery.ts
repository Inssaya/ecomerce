"use client";

/**
 * What delivery costs, asked once and answered the same way everywhere.
 *
 * The cart and the checkout each used to hold their own copy of two numbers —
 * `const DELIVERY_FEE = 30`, `total >= 500 ? 0 : 30` — while the server charged
 * whatever its settings said and the city pages published a per-city override
 * that neither of them knew about. Three copies of one rule in a shop where the
 * money changes hands at the door: the customer reads one number on the site
 * and the courier asks for another, and the package comes back. A refused
 * package is the most expensive event in this business, and the panel has a
 * screen devoted to measuring it.
 *
 * So the rule lives on the server and is read from it. This module is the
 * reading, cached for the tab, and the arithmetic that mirrors what the till
 * will do.
 */
import { useEffect, useState } from "react";

import { api, type Place } from "./api";
import type { Lang } from "./i18n";

export interface Delivery {
  /** What it costs anywhere we have not named. */
  fee: number;
  /** Above this subtotal, nothing. */
  freeOver: number;
  /** The cities we are willing to make a promise about. */
  cities: Place[];
}

//: Per language, because the city names come back translated.
const cache = new Map<Lang, Promise<Delivery>>();

export function loadDelivery(lang: Lang): Promise<Delivery> {
  let pending = cache.get(lang);
  if (!pending) {
    pending = api.places(lang).then((body) => ({
      fee: body.default.delivery_fee,
      freeOver: body.default.free_delivery_over,
      cities: body.items,
    }));
    // A failed load must not be remembered as the answer, or one bad moment on
    // a phone in a lift costs the shop every subsequent price on the page.
    pending.catch(() => cache.delete(lang));
    cache.set(lang, pending);
  }
  return pending;
}

export function useDelivery(lang: Lang): Delivery | null {
  const [terms, setTerms] = useState<Delivery | null>(null);
  useEffect(() => {
    let alive = true;
    loadDelivery(lang)
      .then((value) => {
        if (alive) setTerms(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [lang]);
  return terms;
}

/**
 * The city somebody typed, matched to one we have named.
 *
 * Checkout takes the city as free text on purpose — a dropdown missing
 * someone's town loses the order — so this is a match rather than a lookup, and
 * it mirrors the server exactly: the English name case-insensitively, then the
 * Arabic name as written.
 */
export function matchCity(cities: Place[], typed: string | null | undefined): Place | null {
  const trimmed = (typed ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return (
    cities.find((place) => place.name_en.trim().toLowerCase() === lower) ??
    cities.find((place) => place.name.trim() === trimmed) ??
    null
  );
}

/** What this order will actually be charged for delivery. */
export function feeFor(subtotal: number, terms: Delivery, city?: string | null): number {
  if (subtotal >= terms.freeOver) return 0;
  return matchCity(terms.cities, city)?.delivery_fee ?? terms.fee;
}

/**
 * Free on everything, whatever the basket holds.
 *
 * A threshold of zero is cleared by every possible order, so there is no
 * "spend 500 to unlock it" to advertise — just a flat promise. The pages that
 * used to print "free over 500" ask this instead of comparing the number
 * themselves, so the day the shop reintroduces a threshold, they all start
 * naming it again from one edit.
 */
export function alwaysFree(terms: Delivery): boolean {
  return terms.freeOver <= 0;
}
