/**
 * The owner's API, typed.
 *
 * One function per endpoint the new admin pages call. Shapes are ported
 * unchanged from the deleted `lib/admin.ts` where the backend is unchanged —
 * `pulse`/`money`/`analytics`/`forecast`/orders/requests/catalog are all
 * pre-existing endpoints, not new work — plus the two genuinely new surfaces
 * this rebuild adds: `customers` and `contactMessages`.
 */
import { call } from "./session";

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

/** `date_from`/`date_to` for the last N days, inclusive of today. */
function periodQuery(days: number): string {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return `date_from=${iso(start)}&date_to=${iso(end)}`;
}

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
    steps: { step: string; step_ar: string; people: number; of_all_pct: number; kept_pct: number; lost: number }[];
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
    asked_us_to_make: { category: string; category_ar: string; requests: number; avg_budget: number | null }[];
  };
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

export interface Forecast {
  horizon_days: number;
  based_on_days: number;
  expected_units: number;
  expected_revenue: number;
  shop_open_to_order_pct: number;
  make_now: ForecastRow[];
  items: ForecastRow[];
}

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

export interface Variant {
  id: string;
  sku: string;
  option: string;
  price: number;
  available: number | null;
}

export interface AdminProduct {
  id: string;
  slug: string;
  kind: "shelf" | "workshop";
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  story_en: string;
  story_ar: string;
  price: number;
  category_id: string | null;
  status: "draft" | "active" | "archived";
  available: number | null;
  lead_time_days: number | null;
  show_piece_numbers: boolean;
  images: { id: string; url: string; alt: string; is_primary: boolean }[];
  variants: Variant[];
}

export interface AdminCategory {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  parent_id: string | null;
  display_order: number;
  is_active: boolean;
}

export interface AdminPiece {
  id: string;
  number: number;
  batch_size: number;
  label: string;
  state: "available" | "reserved" | "sold" | "kept";
}

/** A mirror of the server's `ALLOWED_TRANSITIONS` — kept here so the panel
 *  offers only the buttons that will work rather than six, four of which
 *  would fail. The server remains the authority. */
export const NEXT_STATUSES: Record<string, string[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "failed"],
  delivered: [],
  failed: ["out_for_delivery", "returned"],
  cancelled: [],
  returned: [],
};

export interface Customer {
  id: string;
  has_account: boolean;
  name: string;
  phone: string;
  email: string | null;
  created_account_at: string | null;
  is_active: boolean | null;
  orders_count: number;
  revenue_mad: number;
  products_bought: number;
  products_cancelled: number;
  time_on_site_seconds: number | null;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
}

export const admin = {
  pulse: () => call<Pulse>("/admin/pulse"),
  money: () => call<Money>("/admin/money"),
  analytics: (days = 30) => call<Analytics>(`/admin/analytics?${periodQuery(days)}`),
  forecast: () => call<Forecast>("/admin/forecast"),

  orders: (status?: string, query?: string) =>
    call<AdminOrder[]>(
      `/admin/orders?size=60${status ? `&status=${status}` : ""}${
        query ? `&q=${encodeURIComponent(query)}` : ""
      }`,
    ),
  moveOrder: (reference: string, status: string, note?: string) =>
    call<AdminOrder>(`/admin/orders/${reference}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note: note || null }),
    }),

  requests: (status?: string) => call<AdminRequest[]>(`/admin/requests?size=60${status ? `&status=${status}` : ""}`),
  quote: (reference: string, price: number, leadTimeDays: number, note = "") =>
    call<AdminRequest>(`/admin/requests/${reference}/quote`, {
      method: "POST",
      body: JSON.stringify({ price, lead_time_days: leadTimeDays, note_en: note, note_ar: note }),
    }),
  moveRequest: (reference: string, status: string, note?: string) =>
    call<AdminRequest>(`/admin/requests/${reference}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note: note || null }),
    }),

  categories: () => call<AdminCategory[]>("/admin/categories"),
  createCategory: (nameEn: string, nameAr: string) =>
    call<AdminCategory>("/admin/categories", {
      method: "POST",
      body: JSON.stringify({ name_en: nameEn, name_ar: nameAr }),
    }),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    call<AdminCategory>(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  products: () => call<AdminProduct[]>("/admin/products?size=60"),
  createProduct: (body: Record<string, unknown>) =>
    call<AdminProduct>("/admin/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    call<AdminProduct>(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  async addPhoto(productId: string, file: File): Promise<void> {
    const { ownerToken } = await import("./session");
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`/api/admin/products/${productId}/media?lang=en`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerToken() ?? ""}` },
      body,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(detail?.detail || "That photo would not upload");
    }
  },
  setCoverPhoto: (mediaId: string) => call<{ id: string }>(`/admin/media/${mediaId}/primary`, { method: "POST" }),
  removePhoto: (mediaId: string) => call<void>(`/admin/media/${mediaId}`, { method: "DELETE" }),

  addVariant: (productId: string, body: { sku: string; option_en: string; option_ar?: string; price?: number | null }) =>
    call<Variant>(`/admin/products/${productId}/variants`, { method: "POST", body: JSON.stringify(body) }),
  retireVariant: (variantId: string) => call<void>(`/admin/variants/${variantId}`, { method: "DELETE" }),

  pieces: (productId: string) => call<AdminPiece[]>(`/admin/products/${productId}/pieces`),
  addPieces: (productId: string, quantity: number) =>
    call<AdminPiece[]>(`/admin/products/${productId}/pieces`, {
      method: "POST",
      body: JSON.stringify({ quantity }),
    }),
  removePiece: (pieceId: string) => call<void>(`/admin/pieces/${pieceId}`, { method: "DELETE" }),
  waiting: (productId: string) => call<{ waiting: number }>(`/admin/products/${productId}/waiting`),

  copilot: (messages: { role: string; content: string }[]) =>
    call<{ reply: string }>("/admin/copilot", { method: "POST", body: JSON.stringify({ messages }) }),

  customers: (q?: string) => call<Customer[]>(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  setCustomerActive: (id: string, active: boolean) =>
    call<{ id: string; is_active: boolean }>(`/admin/customers/${id}/active`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),

  contactMessages: () => call<ContactMessage[]>("/admin/contact-messages"),
  markMessageRead: (id: string) => call<ContactMessage>(`/admin/contact-messages/${id}/read`, { method: "POST" }),
};
