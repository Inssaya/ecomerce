import type { Category, Label, LabelGroup, Product, ProductListResponse, SearchResponse, TokenResponse, User } from "@/types";

// Server-side: use internal Docker network URL
// Client-side: use relative path (rewritten by next.config.ts → gateway)
const BASE =
  typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://gateway:8000")
    : "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Categories ────────────────────────────────────────────────────────────────

export function getCategories(): Promise<Category[]> {
  return apiFetch("/api/v1/catalog/categories/tree");
}

export function getCategory(slug: string): Promise<Category> {
  return apiFetch(`/api/v1/catalog/categories/${slug}`);
}

// ── Labels ────────────────────────────────────────────────────────────────────

export function getLabels(group?: LabelGroup): Promise<Label[]> {
  const qs = group ? `?group=${group}` : "";
  return apiFetch(`/api/v1/catalog/labels${qs}`);
}

// ── Products ──────────────────────────────────────────────────────────────────

export interface ProductFilters {
  category_id?: string;
  label_ids?: string[];
  seller_id?: string;
  status?: string;
  page?: number;
  size?: number;
  sort_by?: string;
}

export function getProducts(filters: ProductFilters = {}): Promise<ProductListResponse> {
  const params = new URLSearchParams();
  if (filters.category_id) params.set("category_id", filters.category_id);
  if (filters.seller_id) params.set("seller_id", filters.seller_id);
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.size) params.set("size", String(filters.size));
  if (filters.sort_by) params.set("sort_by", filters.sort_by);
  if (filters.label_ids) filters.label_ids.forEach((id) => params.append("label_ids", id));
  return apiFetch(`/api/v1/catalog/products?${params}`);
}

export function getProduct(id: string): Promise<Product> {
  return apiFetch(`/api/v1/catalog/products/${id}`);
}

export function searchProducts(
  q: string,
  opts: { category_id?: string; label_ids?: string[]; page?: number; size?: number } = {}
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  if (opts.category_id) params.set("category_id", opts.category_id);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.size) params.set("size", String(opts.size));
  if (opts.label_ids) opts.label_ids.forEach((id) => params.append("label_ids", id));
  return apiFetch(`/api/v1/catalog/products/search?${params}`);
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function register(data: {
  email: string;
  password: string;
  role: string;
  full_name?: string;
}): Promise<TokenResponse> {
  return apiFetch("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function login(email: string, password: string): Promise<TokenResponse> {
  return apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getMe(token: string): Promise<User> {
  return apiFetch("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
