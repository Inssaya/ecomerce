/** One function per owner-only endpoint the console calls. */
import { call, callUpload } from "./auth";
import type {
  AdminCategory,
  AdminOrder,
  AdminPiece,
  AdminProduct,
  AdminRequest,
  Analytics,
  AttributeGroup,
  AttributeSuggestions,
  ContactMessage,
  CopilotAnswer,
  Customer,
  Decide,
  FeedPreview,
  FeedWeight,
  Forecast,
  ProductAnalytics,
  ProductAttribute,
  ProductMedia,
  Today,
  Variant,
  Waiting,
} from "./types";

/**
 * The Board's strip owns a real date range, not a day count.
 *
 * It used to send `days`, which cannot express "this month" or any range
 * that does not end today — so a period control offering either was
 * unbuildable. The server has always taken `date_from`/`date_to`.
 */
export interface Range {
  from: string;
  to: string;
}

/** Category or piece. Absent keys mean the whole shop, which is the default. */
export interface Scope {
  categoryId?: string;
  productId?: string;
}

function query(range: Range, scope: Scope = {}): string {
  const parts = [`date_from=${range.from}`, `date_to=${range.to}`];
  if (scope.categoryId) parts.push(`category_id=${scope.categoryId}`);
  if (scope.productId) parts.push(`product_id=${scope.productId}`);
  return parts.join("&");
}

export const api = {
  // ── Board ──────────────────────────────────────────────────────────────────
  /** The whole first face in one request. */
  today: (range: Range, scope: Scope = {}) => call<Today>(`/admin/today?${query(range, scope)}`),
  decide: (range: Range) => call<Decide>(`/admin/decide?${query(range)}`),
  forecast: () => call<Forecast>("/admin/forecast"),
  waiting: () => call<Waiting[]>("/admin/waiting"),
  /** `limit` reaches the per-piece table and the unmet lists, which
      otherwise truncate at 60 and 20 with no sign a tail was dropped. */
  analytics: (range: Range, limit?: number) =>
    call<Analytics>(`/admin/analytics?${query(range)}${limit ? `&limit=${limit}` : ""}`),

  // ── Orders ─────────────────────────────────────────────────────────────────
  orders: (status?: string, query?: string, size = 30) =>
    call<AdminOrder[]>(
      `/admin/orders?size=${size}${status ? `&status=${status}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`,
    ),
  order: (reference: string) => call<AdminOrder>(`/admin/orders/${reference}`),
  moveOrder: (reference: string, status: string, note?: string) =>
    call<AdminOrder>(`/admin/orders/${reference}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note: note || null }),
    }),

  requests: (status?: string, size = 30) =>
    call<AdminRequest[]>(`/admin/requests?size=${size}${status ? `&status=${status}` : ""}`),
  request: (reference: string) => call<AdminRequest>(`/admin/requests/${reference}`),
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

  messages: (options: { unread?: boolean; archived?: boolean } = {}) =>
    call<ContactMessage[]>(
      `/admin/contact-messages?size=60${options.unread ? "&unread=true" : ""}${options.archived ? "&archived=true" : ""}`,
    ),
  markMessageRead: (id: string) => call<ContactMessage>(`/admin/contact-messages/${id}/read`, { method: "POST" }),
  archiveMessage: (id: string, archived: boolean) =>
    call<ContactMessage>(`/admin/contact-messages/${id}`, { method: "PATCH", body: JSON.stringify({ archived }) }),

  // ── Catalogue ──────────────────────────────────────────────────────────────
  /** The catalogue table. Filtering is the server's job — narrowing a page of
      sixty rows in the browser narrows only that page. */
  products: (
    options: { status?: string; kind?: string; q?: string; categoryId?: string; range?: Range | null } = {},
  ) => {
    const parts = ["size=60"];
    if (options.status) parts.push(`status=${options.status}`);
    if (options.kind) parts.push(`kind=${options.kind}`);
    if (options.q) parts.push(`q=${encodeURIComponent(options.q)}`);
    if (options.categoryId) parts.push(`category_id=${options.categoryId}`);
    if (options.range) parts.push(`date_from=${options.range.from}&date_to=${options.range.to}`);
    return call<AdminProduct[]>(`/admin/products?${parts.join("&")}`);
  },
  productAnalytics: (productId: string, range?: Range | null) =>
    call<ProductAnalytics>(
      `/admin/products/${productId}/analytics${range ? `?date_from=${range.from}&date_to=${range.to}` : ""}`,
    ),
  createProduct: (body: Record<string, unknown>) =>
    call<AdminProduct>("/admin/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    call<AdminProduct>(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  archiveProduct: (id: string) => call<void>(`/admin/products/${id}`, { method: "DELETE" }),

  categories: () => call<AdminCategory[]>("/admin/categories"),
  createCategory: (body: { name_en: string; name_ar?: string; parent_id?: string | null; display_order?: number }) =>
    call<AdminCategory>("/admin/categories", { method: "POST", body: JSON.stringify(body) }),
  /** `CategoryWrite` is a **full replace** — send every field or it is nulled. */
  updateCategory: (id: string, body: Record<string, unknown>) =>
    call<AdminCategory>(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteCategory: (id: string) => call<void>(`/admin/categories/${id}`, { method: "DELETE" }),
  uploadCategoryIcon: (categoryId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return callUpload<AdminCategory>(`/admin/categories/${categoryId}/icon`, body);
  },
  removeCategoryIcon: (categoryId: string) =>
    call<AdminCategory>(`/admin/categories/${categoryId}/icon`, { method: "DELETE" }),

  addPhoto: (productId: string, file: File, alt?: { alt_en?: string; alt_ar?: string }) => {
    const body = new FormData();
    body.append("file", file);
    const query = new URLSearchParams();
    if (alt?.alt_en) query.set("alt_en", alt.alt_en);
    if (alt?.alt_ar) query.set("alt_ar", alt.alt_ar);
    const suffix = query.toString();
    return callUpload<ProductMedia>(`/admin/products/${productId}/media${suffix ? `?${suffix}` : ""}`, body);
  },
  updatePhoto: (mediaId: string, body: { alt_en?: string; alt_ar?: string; is_process_footage?: boolean }) =>
    call<ProductMedia>(`/admin/media/${mediaId}`, { method: "PATCH", body: JSON.stringify(body) }),
  setCoverPhoto: (mediaId: string) => call<ProductMedia>(`/admin/media/${mediaId}/primary`, { method: "POST" }),
  removePhoto: (mediaId: string) => call<void>(`/admin/media/${mediaId}`, { method: "DELETE" }),

  // ── Specification: measures, colours, materials ────────────────────────────
  attributeSuggestions: () => call<AttributeSuggestions>("/admin/attribute-suggestions"),
  addAttribute: (
    productId: string,
    body: { group: AttributeGroup; name?: string | null; value: string; hex?: string | null },
  ) => call<ProductAttribute>(`/admin/products/${productId}/attributes`, { method: "POST", body: JSON.stringify(body) }),
  updateAttribute: (attributeId: string, body: Record<string, unknown>) =>
    call<ProductAttribute>(`/admin/attributes/${attributeId}`, { method: "PATCH", body: JSON.stringify(body) }),
  removeAttribute: (attributeId: string) => call<void>(`/admin/attributes/${attributeId}`, { method: "DELETE" }),

  addVariant: (productId: string, body: { sku: string; option_en: string; option_ar?: string; price?: number | null }) =>
    call<Variant>(`/admin/products/${productId}/variants`, { method: "POST", body: JSON.stringify(body) }),
  updateVariant: (variantId: string, body: Record<string, unknown>) =>
    call<Variant>(`/admin/variants/${variantId}`, { method: "PATCH", body: JSON.stringify(body) }),
  retireVariant: (variantId: string) => call<void>(`/admin/variants/${variantId}`, { method: "DELETE" }),

  pieces: (productId: string) => call<AdminPiece[]>(`/admin/products/${productId}/pieces`),
  addPieces: (productId: string, quantity: number) =>
    call<AdminPiece[]>(`/admin/products/${productId}/pieces`, { method: "POST", body: JSON.stringify({ quantity }) }),
  removePiece: (pieceId: string) => call<void>(`/admin/pieces/${pieceId}`, { method: "DELETE" }),
  waitingOn: (productId: string) => call<{ waiting: number }>(`/admin/products/${productId}/waiting`),

  // ── Customers ──────────────────────────────────────────────────────────────
  customers: (q?: string) => call<Customer[]>(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  setCustomerActive: (id: string, active: boolean) =>
    call<{ id: string; is_active: boolean }>(`/admin/customers/${id}/active`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),

  // ── Feed ───────────────────────────────────────────────────────────────────
  feedWeights: () => call<FeedWeight[]>("/admin/feed/weights"),
  /** Always the full set of six — the server writes them in one transaction. */
  setFeedWeights: (weights: { key: string; value: number }[]) =>
    call<FeedWeight[]>("/admin/feed/weights", { method: "PUT", body: JSON.stringify(weights) }),
  feedPreview: (limit = 20) => call<FeedPreview>(`/admin/feed/preview?limit=${limit}`),
  refreshEmbeddings: (force = false) =>
    call<{ embedded: number; skipped: number; unavailable: number }>(
      `/admin/feed/embeddings?force=${force}`,
      { method: "POST" },
    ),

  // ── Assistant ──────────────────────────────────────────────────────────────
  copilot: (messages: { role: string; content: string }[]) =>
    call<CopilotAnswer>("/admin/copilot", { method: "POST", body: JSON.stringify({ messages }) }),
};

export * from "./types";
