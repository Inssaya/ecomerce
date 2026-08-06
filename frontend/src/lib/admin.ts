/**
 * The owner's side of the API.
 *
 * The access token is kept in memory and in sessionStorage, not a cookie: this
 * is one person on their own phone, and a token that dies with the tab is one
 * less thing to leak.
 */
import type { Lang } from "./i18n";

const TOKEN_KEY = "mostyle_owner_token";

export function ownerToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setOwnerToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export class NotSignedIn extends Error {}

async function call<T>(path: string, lang: Lang, init: RequestInit = {}): Promise<T> {
  const token = ownerToken();
  if (!token) throw new NotSignedIn();

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept-language", lang);
  if (init.body) headers.set("content-type", "application/json");

  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`/api${path}${separator}lang=${lang}`, { ...init, headers });
  if (response.status === 401 || response.status === 403) {
    setOwnerToken(null);
    throw new NotSignedIn();
  }
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export interface Pulse {
  date: string;
  orders_today: number;
  collected_today_mad: number;
  visitors_today: number;
  open_orders: number;
  requests_waiting_on_a_quote: number;
}

export interface Money {
  revenue: { collected_mad: number; orders_delivered: number; average_order_mad: number; change_mad: number };
  refusals: {
    refusal_rate_pct: number;
    refused: number;
    delivered_or_attempted: number;
    target_pct: number;
    worst_cities: { city: string; refused: number; attempted: number }[];
  };
  conversion: { visitors: number; orders_placed: number; visitor_to_order_pct: number; cart_to_order_pct: number };
}

export interface Decide {
  demand: {
    people_asked_us_to_make: string[];
    searched_for: { query: string; times: number }[];
    categories_earning_attention: { category: string; score: number }[];
  };
  shelf: {
    running_out: { title: string; slug: string; available: number }[];
    not_moving: { title: string; slug: string; available: number }[];
  };
  best_sellers: { pieces: { title: string; sold: number; revenue_mad: number }[] };
}

export const admin = {
  async signIn(lang: Lang, email: string, password: string): Promise<void> {
    const response = await fetch(`/api/auth/login?lang=${lang}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error("Email or password is incorrect");
    const body = await response.json();
    if (body.user?.role !== "owner") throw new Error("That account is not the workshop's");
    setOwnerToken(body.access_token);
  },

  pulse: (lang: Lang) => call<Pulse>("/admin/pulse", lang),
  money: (lang: Lang) => call<Money>("/admin/money", lang),
  decide: (lang: Lang) => call<Decide>("/admin/decide", lang),
  explain: (lang: Lang) => call<{ name: string; explanation: string }[]>("/admin/explain", lang),

  orders: (lang: Lang, status?: string) =>
    call<Record<string, unknown>[]>(`/admin/orders${status ? `?status=${status}` : ""}`, lang),
  moveOrder: (lang: Lang, reference: string, status: string) =>
    call(`/admin/orders/${reference}/status`, lang, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  requests: (lang: Lang, status?: string) =>
    call<Record<string, unknown>[]>(`/admin/requests${status ? `?status=${status}` : ""}`, lang),
  quote: (lang: Lang, reference: string, price: number, leadTimeDays: number) =>
    call(`/admin/requests/${reference}/quote`, lang, {
      method: "POST",
      body: JSON.stringify({ price, lead_time_days: leadTimeDays }),
    }),

  weights: (lang: Lang) =>
    call<{ key: string; value: number; explains: string }[]>("/admin/feed/weights", lang),
  setWeights: (lang: Lang, weights: { key: string; value: number }[]) =>
    call<{ key: string; value: number; explains: string }[]>("/admin/feed/weights", lang, {
      method: "PUT",
      body: JSON.stringify(weights),
    }),

  copilot: (lang: Lang, messages: { role: string; content: string }[]) =>
    call<{ reply: string }>("/admin/copilot", lang, {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
};
