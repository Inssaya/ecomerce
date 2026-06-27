export type UserRole = "buyer" | "seller" | "delivery_individual" | "delivery_company" | "admin";
export type UserStatus = "pending" | "active" | "restricted" | "banned";
export type ProductStatus = "draft" | "active" | "paused" | "deleted";
export type LabelGroup =
  | "style"
  | "material"
  | "audience"
  | "use_case"
  | "season"
  | "color"
  | "brand"
  | "size"
  | "other";

export interface Store {
  id: string;
  slug: string;
  name: string;
  description: string;
  theme_color: string;
  accent_color: string;
  hero_tagline: string;
  whatsapp_number: string;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parent_id: string | null;
  display_order: number;
  is_active: boolean;
  children: Category[];
}

export interface Label {
  id: string;
  group: LabelGroup;
  name: string;
  slug: string;
}

export interface ProductMedia {
  id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface Product {
  id: string;
  seller_id: string;
  store_id: string | null;
  title: string;
  description: string;
  price: number;
  currency: string;
  stock: number;
  category_id: string | null;
  category: Category | null;
  labels: Label[];
  media: ProductMedia[];
  status: ProductStatus;
  rating: number;
  view_count: number;
  created_at: string;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface SearchResponse {
  hits: Record<string, unknown>[];
  total: number;
  query: string;
  processing_time_ms: number;
}

export interface CartItem {
  product_id: string;
  seller_id: string;
  title: string;
  price: number;
  currency: string;
  quantity: number;
  image_url: string | null;
}

export interface User {
  id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user?: { id: string; role: UserRole };
}
