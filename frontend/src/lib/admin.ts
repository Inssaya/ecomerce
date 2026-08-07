/**
 * The owner's side of the API.
 *
 * The access token is kept in sessionStorage, not a cookie: this is one person
 * on their own phone, and a token that dies with the tab is one less thing to
 * leak. It expires after an hour, so the refresh token is kept beside it and
 * spent automatically — otherwise the panel throws the owner back to the sign-in
 * form in the middle of the working day, mid-quote, and the day is long.
 */
import { problemFrom } from "./detail";
import type { Lang } from "./i18n";

const TOKEN_KEY = "mostyle_owner_token";
const REFRESH_KEY = "mostyle_owner_refresh";

export function ownerToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setOwnerToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

/** Both halves of a session, from a login or a renewal. */
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

async function call<T>(
  path: string,
  lang: Lang,
  init: RequestInit = {},
  mayRenew = true,
): Promise<T> {
  const token = ownerToken();
  if (!token) throw new NotSignedIn();

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept-language", lang);
  if (init.body) headers.set("content-type", "application/json");

  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`/api${path}${separator}lang=${lang}`, { ...init, headers });
  if (response.status === 401 || response.status === 403) {
    // 401 is an expired hour, not a refusal — try the refresh token once and
    // replay. 403 is the server saying no to *this* account, and no amount of
    // fresh tokens changes that.
    if (mayRenew && response.status === 401 && (await renew())) {
      return call<T>(path, lang, init, false);
    }
    forgetSession();
    throw new NotSignedIn();
  }
  if (!response.ok) {
    // The server's own sentence, not a status code. It refuses things for
    // reasons the owner needs to read — "Add at least one photo of the piece
    // before publishing it" is an instruction; "Request failed (400)" is a
    // dead end on the one screen that puts things in the shop.
    throw new Error(await problemFrom(response));
  }
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

/** `date_from`/`date_to` for the last N days, inclusive of today. */
function periodQuery(days: number): string {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return `date_from=${iso(start)}&date_to=${iso(end)}`;
}

/** What people did here. Every count is people, never events. */
export interface Analytics {
  period: { from: string; to: string };
  audience: {
    visitors: number;
    returning: number;
    returning_pct: number;
    actions: number;
    actions_per_visitor: number;
    daily: { date: string; visitors: number }[];
  };
  funnel: {
    steps: {
      step: string;
      step_ar: string;
      people: number;
      of_all_pct: number;
      kept_pct: number;
      lost: number;
    }[];
  };
  pages: {
    items: {
      path: string;
      people: number;
      scrolled: number;
      scrolled_pct: number;
      avg_seconds: number;
      acted: number;
      acted_pct: number;
    }[];
  };
  products: {
    items: {
      product_id: string;
      title: string;
      saw: number;
      opened: number;
      opened_pct: number;
      stayed: number;
      avg_seconds: number;
      added: number;
      bought: number;
      bought_pct: number;
    }[];
  };
  unmet: {
    searched_and_found_nothing: { query: string; people: number }[];
    asked_us_to_make: {
      category: string;
      category_ar: string;
      requests: number;
      avg_budget: number | null;
    }[];
  };
}

/** What we expect to sell next week, and how many to make. */
export interface Forecast {
  horizon_days: number;
  based_on_days: number;
  expected_units: number;
  expected_revenue: number;
  shop_open_to_order_pct: number;
  make_now: ForecastRow[];
  items: ForecastRow[];
}

export interface ForecastRow {
  product_id: string;
  slug: string;
  title: string;
  title_ar: string;
  kind: "shelf" | "workshop";
  expected: number;
  range: [number, number];
  on_the_shelf: number;
  days_of_cover: number | null;
  make: number;
  revenue_if_met: number;
  confidence: "low" | "medium" | "high";
  because: string;
}

/** An order as the workshop sees it. */
export interface AdminOrder {
  reference: string;
  tracking_token: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  address: { line1?: string; city?: string; notes?: string };
  items: {
    title: string;
    variant_label: string;
    piece_label: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    image_url: string | null;
  }[];
  events: { status: string; created_at: string }[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: string;
  created_at: string;
  whatsapp_url: string;
}

/** A custom request waiting on a price. */
export interface AdminRequest {
  reference: string;
  tracking_token: string;
  description: string;
  status: string;
  quote_price: number | null;
  lead_time_days: number | null;
  promised_for: string | null;
  order_reference: string | null;
  created_at: string;
  whatsapp_url: string;
}

/** A piece as the owner edits it, with its batch and its waiting list. */
export interface AdminProduct {
  id: string;
  slug: string;
  kind: "shelf" | "workshop";
  title_en: string;
  title_ar: string;
  description_en: string;
  price: number;
  status: "draft" | "active" | "archived";
  //: Null for made-to-order, which never has a count.
  available: number | null;
  lead_time_days: number | null;
  show_piece_numbers: boolean;
  /** The API calls these `images`, and so does this. */
  images: { id: string; url: string; alt: string; is_primary: boolean }[];
}

export interface AdminPiece {
  id: string;
  number: number;
  batch_size: number;
  label: string;
  state: "available" | "reserved" | "sold" | "kept";
}

/**
 * The states an order may legally move to next.
 *
 * A mirror of ALLOWED_TRANSITIONS on the server, kept here so the panel offers
 * only the buttons that will work rather than showing six and letting four of
 * them fail. The server remains the authority — this decides what to draw, not
 * what is permitted.
 */
export const NEXT_STATUSES: Record<string, string[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "failed"],
  // Terminal. A delivered order cannot be walked back into another state —
  // the piece is sold and the customer has already been told.
  delivered: [],
  // The courier could not hand it over: send it out again, or accept it back.
  failed: ["out_for_delivery", "returned"],
  cancelled: [],
  returned: [],
};

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
    keepSession(body);
  },

  /**
   * Leave properly.
   *
   * Clearing sessionStorage only removes the tokens from this browser; the
   * refresh token stays valid on the server for thirty days, so anything that
   * got a copy of it could still mint access tokens long after the owner
   * thought they had signed out. `/auth/logout` revokes it.
   *
   * The local clear happens first and unconditionally: whatever the network
   * says, pressing sign out signs you out of this phone.
   */
  async signOut(lang: Lang): Promise<void> {
    const token = typeof window === "undefined" ? null : sessionStorage.getItem(REFRESH_KEY);
    forgetSession();
    if (!token) return;
    await fetch(`/api/auth/logout?lang=${lang}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
      keepalive: true,
    }).catch(() => undefined);
  },

  /**
   * Change the password without going through email.
   *
   * The reset link is the recovery path and it depends on SMTP being right; this
   * is the ordinary one, and it is the only way to change a password that was
   * chosen for you by whoever ran `seed-owner`. The server revokes every session
   * on success — including this one — so the panel drops back to sign-in rather
   * than pretending it is still holding a live session.
   */
  async changePassword(lang: Lang, current: string, next: string): Promise<void> {
    await call<void>("/auth/change-password", lang, {
      method: "POST",
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    forgetSession();
  },

  pulse: (lang: Lang) => call<Pulse>("/admin/pulse", lang),
  money: (lang: Lang) => call<Money>("/admin/money", lang),
  decide: (lang: Lang) => call<Decide>("/admin/decide", lang),
  analytics: (lang: Lang, days = 30) =>
    call<Analytics>(`/admin/analytics?${periodQuery(days)}`, lang),
  forecast: (lang: Lang) => call<Forecast>("/admin/forecast", lang),
  explain: (lang: Lang) => call<{ name: string; explanation: string }[]>("/admin/explain", lang),

  orders: (lang: Lang, status?: string) =>
    call<AdminOrder[]>(`/admin/orders?size=60${status ? `&status=${status}` : ""}`, lang),
  moveOrder: (lang: Lang, reference: string, status: string, note?: string) =>
    call<AdminOrder>(`/admin/orders/${reference}/status`, lang, {
      method: "POST",
      body: JSON.stringify({ status, note: note || null }),
    }),

  requests: (lang: Lang, status?: string) =>
    call<AdminRequest[]>(`/admin/requests?size=60${status ? `&status=${status}` : ""}`, lang),
  quote: (lang: Lang, reference: string, price: number, leadTimeDays: number, note = "") =>
    call<AdminRequest>(`/admin/requests/${reference}/quote`, lang, {
      method: "POST",
      body: JSON.stringify({ price, lead_time_days: leadTimeDays, note_en: note, note_ar: note }),
    }),

  moveRequest: (lang: Lang, reference: string, status: string, note?: string) =>
    call<AdminRequest>(`/admin/requests/${reference}/status`, lang, {
      method: "POST",
      body: JSON.stringify({ status, note: note || null }),
    }),

  // ── The shelf ──────────────────────────────────────────────────────────────

  products: (lang: Lang) => call<AdminProduct[]>("/admin/products?size=60", lang),

  createProduct: (lang: Lang, body: Record<string, unknown>) =>
    call<AdminProduct>("/admin/products", lang, { method: "POST", body: JSON.stringify(body) }),

  updateProduct: (lang: Lang, id: string, body: Record<string, unknown>) =>
    call<AdminProduct>(`/admin/products/${id}`, lang, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  /** Multipart, so it cannot go through `call` — that one sets a JSON body. */
  async addPhoto(lang: Lang, productId: string, file: File): Promise<void> {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`/api/admin/products/${productId}/media?lang=${lang}`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerToken() ?? ""}` },
      body,
    });
    if (response.status === 401) throw new NotSignedIn();
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "That photo would not upload");
    }
  },

  pieces: (lang: Lang, productId: string) =>
    call<AdminPiece[]>(`/admin/products/${productId}/pieces`, lang),

  addPieces: (lang: Lang, productId: string, quantity: number) =>
    call<AdminPiece[]>(`/admin/products/${productId}/pieces`, lang, {
      method: "POST",
      body: JSON.stringify({ quantity }),
    }),

  waiting: (lang: Lang, productId: string) =>
    call<{ waiting: number }>(`/admin/products/${productId}/waiting`, lang),

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
