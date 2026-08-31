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
import { sessionToken } from "./session-store";

export interface Piece {
  id: string;
  slug: string;
  title: string;
  price: number;
  image: string | null;
  category_slug: string | null;
  category_name: string | null;
  /** What it costs today. Computed on the server, so the card and the piece
   *  page cannot disagree with each other about the number the buyer sees. */
  effective_price: number;
  discount_active: boolean;
}

/** One row of specification: a measure, a colour or a material. */
export interface PieceAttribute {
  id: string;
  group: "measure" | "color" | "material";
  /** "Width" — or null, for a plain value like "M" or "Wood". */
  name: string | null;
  value: string;
  /** Only for colours. */
  hex: string | null;
  display_order: number;
  /** Composed on the server so every screen joins the pair the same way. */
  label: string;
}

export interface PieceDetail extends Piece {
  description: string;
  story: string;
  images: { id: string; url: string; alt: string; is_primary: boolean }[];
  variants: { id: string; sku: string; option: string; price: number }[];
  made_on: string | null;
  created_at: string;
  /** The three groups the piece is described by. Any of them can be empty. */
  attributes: PieceAttribute[];
  /** Present and non-zero when the shop is running an offer on this piece. */
  discount_active: boolean;
  effective_price: number;
  /** Whether the buyer can put their name on it, and how much that costs. */
  personalizable: boolean;
  personalization_markup_pct: number;
}

/** The visitor's own state on a piece, plus what everyone else did. */
export interface InteractionState {
  likes: number;
  saves: number;
  liked: boolean;
  saved: boolean;
}

/** The toggle response — same shape plus what actually happened this tap. */
export interface InteractionToggle extends InteractionState {
  /** true after this call left the visitor liking/saving; false after undo. */
  active: boolean;
}

/** A line of work — hooks, brackets, lamps. What the shelf actually learns from. */
export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  icon_url: string | null;
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
  category_slug: string | null;
}

export interface ServicePage extends ServiceSummary {
  body: string;
  places: Place[];
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
  order_reference: string | null;
  events: { status: string; created_at: string }[];
  created_at: string;
  whatsapp_url: string;
}

/** The server's view of a customer account — what `/auth/login`,
 *  `/auth/register` and `/auth/me` all return about the user, in the shape
 *  `lib/session.ts` turns into a stored session. */
export interface AuthProfile {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  avatar_url?: string | null;
}

export interface AuthReply {
  access_token: string;
  user?: AuthProfile;
}

/** One row of `GET /orders/mine` — enough to list an order on the profile
 *  page, not the full detail `OrderView` carries for tracking one. */
export interface MyOrder {
  reference: string;
  status: string;
  total: number;
  created_at: string;
  tracking_token: string;
  items: { title: string; quantity: number; image_url: string | null }[];
}

export interface MyOrders {
  orders: MyOrder[];
  total_spent: number;
  delivered: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Set only for a handful of machine-readable refusals — today just
     *  `"blocked"`, from the blocklist middleware. Everything else is a
     *  plain sentence with no code, and callers should keep reading
     *  `.message`. */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** The whole storefront's reaction to a `403 blocked` response, wherever it
 *  came from — see `Chrome.tsx`, which listens for this and swaps the page
 *  for the block screen. A window event rather than React state here because
 *  the throw can come from any component, at any depth, mid-checkout or
 *  mid-scroll. */
export const BLOCKED_EVENT = "mostyle:blocked";

async function request<T>(
  path: string,
  { lang, ...init }: RequestInit & { lang: Lang },
): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const headers = new Headers(init.headers);
  headers.set("accept-language", lang);
  // FormData is the exception: the browser has to set its own `multipart/…`
  // content type, boundary and all, and stamping JSON over it makes the server
  // read the upload as a malformed body.
  if (init.body && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  // Server-rendered requests have no browser to fingerprint.
  if (typeof window !== "undefined") {
    headers.set("x-visitor-id", await visitorId());
    // Signed in? Say so. Checkout reads it to attach the order to the account,
    // which is the only reason a customer's purchase history can exist at all —
    // without this header every order is a guest order and every profile is
    // permanently empty.
    const token = sessionToken();
    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`/api${path}${separator}lang=${lang}`, { ...init, headers });
  if (!response.ok) {
    // Read the body once, as a clone, so both the human message and the
    // machine code can come out of it — `Response.json()` only works once.
    let code: string | undefined;
    try {
      const body = await response.clone().json();
      if (typeof body?.code === "string") code = body.code;
    } catch {
      /* not JSON — no code, `problemFrom` will say so below */
    }
    if (code === "blocked" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(BLOCKED_EVENT));
    }
    throw new ApiError(response.status, await problemFrom(response), code);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  piece: (lang: Lang, slug: string) => request<PieceDetail>(`/products/${slug}`, { lang }),

  /**
   * The shelf, a page at a time.
   *
   * `seed` shuffles it. The same seed always produces the same order, which is
   * what makes paging a shuffled list possible at all — the server hashes each
   * id with it, so page two cannot repeat page one. The seed is minted once per
   * visit on the server and carried down here.
   */
  products: (
    lang: Lang,
    {
      page = 1,
      size = 30,
      category,
      q,
      seed,
    }: { page?: number; size?: number; category?: string; q?: string; seed?: number } = {},
  ) =>
    request<{ items: Piece[]; total: number; page: number; size: number; has_more: boolean }>(
      `/products?page=${page}&size=${size}` +
        (category ? `&category=${encodeURIComponent(category)}` : "") +
        (q ? `&q=${encodeURIComponent(q)}` : "") +
        (seed === undefined ? "" : `&seed=${seed}`),
      { lang },
    ),

  /** "Tell me when you make another." Phone only — nobody makes an account
   *  to be told about a hook. */
  waitForMore: (lang: Lang, slug: string, body: { phone: string; email?: string }) =>
    request<{ waiting: boolean }>(`/products/${slug}/alert`, {
      lang,
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Toggle a heart on a piece. Idempotent server-side — a second call from
   *  the same visitor removes the row, and the response says which side of
   *  the toggle they ended on. */
  likePiece: (lang: Lang, slug: string) =>
    request<InteractionToggle>(`/products/${slug}/like`, { lang, method: "POST" }),

  /** Toggle a buy-later save. Same shape as `likePiece`. */
  savePiece: (lang: Lang, slug: string) =>
    request<InteractionToggle>(`/products/${slug}/save`, { lang, method: "POST" }),

  /** The counts plus the visitor's own state, in one call so the buttons
   *  paint correctly on first load. */
  interactions: (lang: Lang, slug: string) =>
    request<InteractionState>(`/products/${slug}/interactions`, { lang }),

  /** The cities we name, and what delivery costs anywhere else. Read by the
   *  cart and the checkout so neither of them has to hold its own copy. */
  places: (lang: Lang) =>
    request<{ items: Place[]; default: { delivery_fee: number; free_delivery_over: number } }>(
      "/places",
      { lang },
    ),

  categories: (lang: Lang) => request<CategoryNode[]>(`/categories`, { lang }),

  /** How to reach the shop. Owner-edited, read by any client component that
   *  cannot use the server-side `lib/server.ts` `contact()` reader. Named
   *  `shopContact` rather than `contact` — that name is already the contact
   *  *form submission* call, below. */
  shopContact: (lang: Lang) =>
    request<{ email: string; phone: string }>(`/settings/contact`, { lang }),

  checkout: (lang: Lang, body: unknown) =>
    request<OrderView>("/orders", { lang, method: "POST", body: JSON.stringify(body) }),

  order: (lang: Lang, token: string) => request<OrderView>(`/orders/track/${token}`, { lang }),

  /** Back into an order without the link. Both fields must match. */
  findOrder: (lang: Lang, body: { reference: string; phone: string }) =>
    request<OrderView>("/orders/find", { lang, method: "POST", body: JSON.stringify(body) }),

  ask: (lang: Lang, body: unknown) =>
    request<RequestView>("/requests", { lang, method: "POST", body: JSON.stringify(body) }),

  /**
   * A photo attached to a custom request, stored before the request is sent.
   *
   * Uploaded one at a time as they are chosen rather than all at once on
   * submit: on a Moroccan phone connection a four-photo upload takes long
   * enough that a customer who pressed send and saw nothing happen presses it
   * again, and the second press is the one that fails.
   */
  uploadReference: async (lang: Lang, file: File) => {
    const body = new FormData();
    body.append("file", file);
    // No JSON content type: the browser must set its own multipart boundary.
    return request<{ url: string }>("/requests/references", { lang, method: "POST", body });
  },

  /** A personal message, so it always lands somewhere the workshop will see
   *  it — the WhatsApp/email links beside this form are drafts the visitor
   *  may or may not actually send; this is the one that always arrives. */
  contact: (lang: Lang, body: { name: string; email?: string; phone?: string; message: string }) =>
    request<{ id: string }>("/contact", { lang, method: "POST", body: JSON.stringify(body) }),

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

  signals: (lang: Lang, signals: readonly object[]) =>
    request<{ recorded: number }>("/signals", {
      lang,
      method: "POST",
      body: JSON.stringify({ signals }),
      keepalive: true,
    }),

  /** Create the session. No token exists yet to send — this is the one call
   *  in this object that is unauthenticated by construction, not by accident. */
  login: (lang: Lang, email: string, password: string) =>
    request<AuthReply>("/auth/login", {
      lang,
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  /** Registration alone — `lib/session.ts` signs in right after, so the new
   *  account never sits half-authenticated. */
  register: (
    lang: Lang,
    body: {
      full_name: string;
      email: string;
      password: string;
      phone: string | null;
      address_line1: string | null;
      city: string | null;
    },
  ) => request<void>("/auth/register", { lang, method: "POST", body: JSON.stringify(body) }),

  /** A correction made on the profile, or filled in at checkout. Authenticated
   *  the same way every other call here is — `request()` attaches the bearer
   *  token by itself, from the very session this writes back into. */
  updateMe: (lang: Lang, changes: { phone?: string; address_line1?: string; city?: string }) =>
    request<AuthProfile>("/auth/me", { lang, method: "PATCH", body: JSON.stringify(changes) }),

  /** A new profile photograph. Same FormData exception as `uploadReference`:
   *  no JSON content type, so the browser can set its own multipart boundary. */
  uploadAvatar: (lang: Lang, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ avatar_url: string | null }>("/auth/me/avatar", {
      lang,
      method: "POST",
      body,
    });
  },

  /** The signed-in customer's own order history — what `/account/profile` lists. */
  myOrders: (lang: Lang) => request<MyOrders>("/orders/mine", { lang }),
};
