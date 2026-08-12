/** Shapes returned by the owner-only `/admin/*` API. */

export interface Period {
  from: string;
  to: string;
}

export interface Pulse {
  date: string;
  orders_today: number;
  collected_today_mad: number;
  visitors_today: number;
  open_orders: number;
  requests_waiting_on_a_quote: number;
}

export interface Revenue {
  period: Period;
  orders_delivered: number;
  collected_mad: number;
  average_order_mad: number;
  previous_period: { orders_delivered: number; collected_mad: number };
  change_mad: number;
  /** Every day in the period, including the empty ones — a gap in a
      sparkline is a day with no revenue, not a day with no data. */
  daily: { date: string; mad: number }[];
}

export interface Refusals {
  period: Period;
  delivered_or_attempted: number;
  refused: number;
  refusal_rate_pct: number;
  target_pct: number;
  worst_cities: { city: string; refused: number; attempted: number }[];
}

export interface Conversion {
  period: Period;
  visitors: number;
  put_something_in_a_cart: number;
  orders_placed: number;
  visitor_to_order_pct: number;
  cart_to_order_pct: number;
}

export interface Audience {
  period: Period;
  visitors: number;
  returning: number;
  returning_pct: number;
  actions: number;
  actions_per_visitor: number;
  daily: { date: string; visitors: number }[];
}

export interface FunnelStep {
  step: string;
  step_ar: string;
  people: number;
  of_all_pct: number;
  kept_pct: number;
  lost: number;
}

/** The Board's first face, in one request. */
export interface Today {
  period: Period;
  /** What the figures were narrowed to, and which blocks could not narrow.
      `shop_wide` names them so the screen can say so rather than showing
      unscoped numbers under a scoped heading. */
  scope: {
    category_id: string | null;
    product_id: string | null;
    active: boolean;
    shop_wide: string[];
  };
  lead: { kind: string; value: string; sentence: string };
  queue: { to_confirm: number; open_orders: number; quotes_to_send: number; unread_messages: number };
  pulse: Pulse;
  revenue: Revenue;
  refusals: Refusals;
  conversion: Conversion;
  audience: Audience;
  funnel: { period: Period; steps: FunnelStep[] };
  /** All five, keyed by metric. Shown beside the figure, never behind a page. */
  explain: Record<string, string>;
}

export interface Analytics {
  period: Period;
  audience: Audience;
  funnel: { period: Period; steps: FunnelStep[] };
  pages: {
    period: Period;
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
    period: Period;
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
    period: Period;
    searched_and_found_nothing: { query: string; people: number }[];
    asked_us_to_make: { category: string; category_ar: string; requests: number; avg_budget: number | null }[];
  };
}

/** What to make next — four sources, in falling order of directness. */
export interface Decide {
  period: Period;
  demand: {
    period: Period;
    people_asked_us_to_make: string[];
    searched_for: { query: string; times: number }[];
    categories_earning_attention: { category: string; score: number }[];
  };
  shelf: {
    running_out: { product_id: string; title: string; slug: string; available: number; sold: number; note?: string }[];
    not_moving: { product_id: string; title: string; slug: string; available: number; sold: number }[];
  };
  best_sellers: {
    period: Period;
    /** `product_id` is null for a piece that no longer exists — the row still
        reports what was sold, it just cannot be opened. */
    pieces: { title: string; sold: number; revenue_mad: number; product_id: string | null }[];
  };
}

/** Somebody who would have paid, for a real piece, at a price they saw. */
export interface Waiting {
  product_id: string;
  title: string;
  slug: string;
  waiting: number;
  since: string | null;
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
  generated_on: string;
  based_on_days: number;
  shop_open_to_order_pct: number;
  expected_units: number;
  expected_revenue: number;
  make_now: ForecastRow[];
  items: ForecastRow[];
}

export interface OrderEvent {
  status: string;
  note: string | null;
  created_at: string;
  /** "workshop" · "customer" · "system" — the 48h sweep is not the owner. */
  actor: string;
}

export interface AdminOrder {
  id: string;
  reference: string;
  tracking_token: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  address: { line1?: string; city?: string; notes?: string };
  city: string;
  items: {
    product_id: string | null;
    title: string;
    variant_label: string;
    piece_label: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    image_url: string | null;
  }[];
  events: OrderEvent[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: string;
  note: string | null;
  created_at: string;
  whatsapp_url: string;
}

/**
 * Mirrors the server's `ALLOWED_TRANSITIONS`, so the console only ever offers
 * a move that will succeed. The server remains the authority.
 */
export const NEXT_ORDER_STATUSES: Record<string, string[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "failed"],
  failed: ["out_for_delivery", "returned"],
  delivered: [],
  cancelled: [],
  returned: [],
};

/**
 * Mirrors `REQUEST_TRANSITIONS`, minus the one move that is not the owner's.
 *
 * `approved` is set by the **customer** accepting the quote, so it is never a
 * button here. And `declined` is only reachable from `requested` — once a
 * price has been sent the way out is `withdrawn`, not decline.
 */
export const NEXT_REQUEST_STATUSES: Record<string, string[]> = {
  requested: ["quoted", "declined", "withdrawn"],
  quoted: ["withdrawn"],
  approved: ["in_production", "withdrawn"],
  in_production: ["ready", "withdrawn"],
  ready: ["delivered", "withdrawn"],
  delivered: [],
  declined: [],
  withdrawn: [],
};

export interface AdminRequest {
  id: string;
  reference: string;
  tracking_token: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  city: string | null;
  description: string;
  budget: number | null;
  /** The customer's own photos — the entire basis for pricing the job. */
  references: string[];
  category_id: string | null;
  source: string | null;
  status: string;
  quote_price: number | null;
  quote_note: string;
  lead_time_days: number | null;
  promised_for: string | null;
  order_reference: string | null;
  events: { status: string; note: string | null; created_at: string; actor: string }[];
  created_at: string;
  whatsapp_url: string;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
}

export interface Variant {
  id: string;
  sku: string;
  option: string;
  price: number;
  available: number | null;
}

export interface ProductMedia {
  id: string;
  url: string;
  alt: string;
  is_primary: boolean;
  is_process_footage: boolean;
  sort_order: number;
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
  price_max: number | null;
  business_boost: number;
  category_id: string | null;
  /** The backend enum includes `paused`; the old client's union omitted it. */
  status: "draft" | "active" | "paused" | "archived";
  available: number | null;
  lead_time_days: number | null;
  made_on: string | null;
  batch_closed: boolean;
  show_piece_numbers: boolean;
  images: ProductMedia[];
  variants: Variant[];
  created_at: string;
}

export interface AdminCategory {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  icon_url: string | null;
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
  variant_id: string | null;
  made_on: string | null;
  photo_url: string | null;
}

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

export interface FeedWeight {
  key: string;
  value: number;
  /** Written for the owner in the backend — used verbatim, not paraphrased. */
  explains: string;
}

export interface FeedPreview {
  visitor: string;
  weights: Record<string, number>;
  items: { product_id: string; title: string; slug: string; score: number; terms: Record<string, number> }[];
}

export interface CopilotAnswer {
  reply: string;
  actions: unknown[];
  /** Which tools ran. The copilot's credibility rests on every number
   *  coming from a tool result, so it is shown, not hidden. */
  trace: { tool: string; ok: boolean; duration_ms: number }[];
}
