/**
 * One place that talks to the API.
 *
 * Every request carries the language and the visitor fingerprint, because
 * essentially every endpoint cares about both: what language to answer in, and
 * whose feed this is.
 */
import { problemFrom } from "./detail";
import { visitorId } from "./fingerprint";
import type { Lang } from "./i18n";

export interface Piece {
  id: string;
  slug: string;
  kind: "shelf" | "workshop";
  title: string;
  price: number;
  price_max: number | null;
  image: string | null;
  category_slug: string | null;
  available: number | null;
  lead_time_days: number | null;
}

export interface PieceDetail extends Piece {
  description: string;
  story: string;
  images: { id: string; url: string; alt: string; is_primary: boolean }[];
  variants: { id: string; sku: string; option: string; price: number; available: number | null }[];
  pieces: {
    id: string;
    number: number;
    batch_size: number;
    label: string;
    state: "available" | "reserved" | "sold" | "kept";
    note: string;
  }[];
  show_piece_numbers: boolean;
  batch_closed: boolean;
  made_on: string | null;
  created_at: string;
}

/** A line of work — hooks, brackets, lamps. What the shelf actually learns from. */
export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  display_order: number;
  children: CategoryNode[];
}

/** A city we deliver to, and what we can honestly say about it. */
export interface Place {
  slug: string;
  name: string;
  name_en: string;
  region: string;
  delivery_days: [number, number];
  delivery_fee: number;
  free_delivery_over: number;
  history?: { delivered: number; worth_saying: boolean; average_days: number | null };
  services?: ServiceSummary[];
}

/** Something the workshop does, as opposed to something it has made. */
export interface ServiceSummary {
  slug: string;
  name: string;
  summary: string;
  from_price: number | null;
  lead_time_days: number | null;
  category_slug: string | null;
}

export interface ServicePage extends ServiceSummary {
  body: string;
  places: Place[];
}

/** What the workshop has actually made. Real counts, no rounding up. */
export interface WorkshopNumbers {
  pieces_made: number;
  pieces_here: number;
  on_the_shelf: number;
  made_to_order: number;
  last_made_on: string | null;
}

export interface OrderView {
  reference: string;
  tracking_token: string;
  customer_name: string;
  city: string;
  items: {
    title: string;
    variant_label: string;
    piece_label: string;
    lead_time_days: number | null;
    unit_price: number;
    quantity: number;
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

export interface RequestView {
  reference: string;
  tracking_token: string;
  description: string;
  status: string;
  quote_price: number | null;
  quote_note: string;
  lead_time_days: number | null;
  promised_for: string | null;
  order_reference: string | null;
  events: { status: string; created_at: string }[];
  created_at: string;
  whatsapp_url: string;
}

/** Something the assistant asked the browser to do. The server has already
 *  validated it; the client only carries it out. */
export interface AssistantAction {
  type: "add_to_cart" | "open_product" | "go_to_checkout" | "open_whatsapp";
  slug?: string;
  product_id?: string;
  variant_id?: string | null;
  quantity?: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  { lang, ...init }: RequestInit & { lang: Lang },
): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const headers = new Headers(init.headers);
  headers.set("accept-language", lang);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  // Server-rendered requests have no browser to fingerprint.
  if (typeof window !== "undefined") {
    headers.set("x-visitor-id", await visitorId());
  }

  const response = await fetch(`/api${path}${separator}lang=${lang}`, { ...init, headers });
  if (!response.ok) {
    throw new ApiError(response.status, await problemFrom(response));
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  feed: (lang: Lang, page = 1) =>
    request<{ items: Piece[]; page: number; has_more: boolean }>(`/feed?page=${page}`, { lang }),

  piece: (lang: Lang, slug: string) => request<PieceDetail>(`/products/${slug}`, { lang }),

  workshop: (lang: Lang) => request<WorkshopNumbers>("/workshop", { lang }),

  search: (lang: Lang, query: string) =>
    request<{ items: Piece[]; total: number }>(`/products?q=${encodeURIComponent(query)}`, { lang }),

  /** "Tell me when you make another." Phone only — nobody makes an account
   *  to be told about a hook. */
  waitForMore: (lang: Lang, slug: string, body: { phone: string; email?: string }) =>
    request<{ waiting: boolean }>(`/products/${slug}/alert`, {
      lang,
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** The cities we name, and what delivery costs anywhere else. Read by the
   *  cart and the checkout so neither of them has to hold its own copy. */
  places: (lang: Lang) =>
    request<{ items: Place[]; default: { delivery_fee: number; free_delivery_over: number } }>(
      "/places",
      { lang },
    ),

  categories: (lang: Lang) => request<CategoryNode[]>(`/categories`, { lang }),

  checkout: (lang: Lang, body: unknown) =>
    request<OrderView>("/orders", { lang, method: "POST", body: JSON.stringify(body) }),

  order: (lang: Lang, token: string) => request<OrderView>(`/orders/track/${token}`, { lang }),

  /** Back into an order without the link. Both fields must match. */
  findOrder: (lang: Lang, body: { reference: string; phone: string }) =>
    request<OrderView>("/orders/find", { lang, method: "POST", body: JSON.stringify(body) }),

  ask: (lang: Lang, body: unknown) =>
    request<RequestView>("/requests", { lang, method: "POST", body: JSON.stringify(body) }),

  customRequest: (lang: Lang, token: string) =>
    request<RequestView>(`/requests/track/${token}`, { lang }),

  approveQuote: (lang: Lang, token: string, body: unknown) =>
    request<RequestView>(`/requests/track/${token}/approve`, {
      lang,
      method: "POST",
      body: JSON.stringify(body),
    }),

  withdrawRequest: (lang: Lang, token: string) =>
    request<RequestView>(`/requests/track/${token}/withdraw`, { lang, method: "POST" }),

  /** Ask for a reset link. Always succeeds, even for an unknown address —
   *  the server refuses to reveal which addresses exist. */
  forgotPassword: (lang: Lang, email: string) =>
    request<void>("/auth/forgot-password", {
      lang,
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (lang: Lang, token: string, newPassword: string) =>
    request<void>("/auth/reset-password", {
      lang,
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  assistantStatus: (lang: Lang) =>
    request<{ available: boolean; whatsapp: boolean }>("/assistant/status", { lang }),

  assistant: (lang: Lang, messages: readonly { role: string; content: string }[]) =>
    request<{ reply: string; actions: AssistantAction[] }>("/assistant", {
      lang,
      method: "POST",
      body: JSON.stringify({ messages }),
    }),

  signals: (lang: Lang, signals: readonly object[]) =>
    request<{ recorded: number }>("/signals", {
      lang,
      method: "POST",
      body: JSON.stringify({ signals }),
      keepalive: true,
    }),
};
