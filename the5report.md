# The Five Reports — Frontend + API + Models + Auth

This document consolidates the five reports you requested: (1) current frontend technology, (2) frontend file tree, (3) exact API contracts for key admin flows, (4) data model fields & relationships, and (5) authentication/session flow (frontend ↔ backend).

---

**Report 1 — Current frontend technology (concise)**

- package.json: `frontend/package.json` — project `mostyle-web`, scripts `dev|build|start|lint|type-check|test`.
- Next.js: `15.5.22` (see `frontend/package.json`).
- React: `19.0.0` (see `frontend/package.json`).
- TypeScript: `tsconfig.json` — `strict: true`, `noEmit`, `paths`: `@/* -> ./src/*`, `target: ES2017`.
- Tailwind: v3 (`tailwind.config.ts`) with custom palette, keyframes and animations; content scans `./src/**/*.{ts,tsx}`.
- UI libraries: none external — UI built with Tailwind + local components in `src/components`.
- Icon approach: inline/custom React icons (no external icon package dependency detected).
- Charting: no library — small charts drawn by hand in SVG (`frontend/src/components/charts.tsx`).
- Animations: CSS/Tailwind keyframes (no external animation library).
- Forms/validation: native HTML forms + server-side (Pydantic) validation; no React Hook Form or similar.
- State management: local React state + a tiny session store (`frontend/src/lib/session-store.ts`); no React Query, Redux, or other global query cache.
- Data fetching: custom wrappers: `frontend/src/lib/api.ts` (storefront) and `frontend/src/lib/admin/client.ts` (admin).
- Component library: project-local components (`frontend/src/components/*`).
- Build config: `frontend/next.config.ts` — `output: "standalone"`, `images.remotePatterns` and rewrites for `/api/*` (proxied to backend) and `/media/*`.

---

**Report 2 — Frontend file tree (relevant files & reuse status)**

Top-level relevant folders and key files (representative):

- `frontend/src/app/` — application routes (Next.js app router).
  - Admin: `frontend/src/app/admin/page.tsx`, `layout.tsx`, `AdminShell.tsx`, `management/page.tsx`, `orders/page.tsx`, `users/page.tsx`, `assistant/page.tsx`.
  - Public: localized routes under `frontend/src/app/[lang]/...` (product pages, checkout, account, search, etc.).

- `frontend/src/components/` — reusable UI:
  - `charts.tsx` (SVG charts), `CategoryRail.tsx`, `ProductFeed.tsx`, `PieceCard.tsx`, `Chrome.tsx`, `CategoryTiles.tsx`, ambient provider files (`ambient/*`).

- `frontend/src/lib/` — API and helpers:
  - `api.ts` (storefront fetch wrapper + TypeScript shapes),
  - `admin/client.ts` (typed admin client used by admin pages),
  - `admin/session.ts` (owner token handling),
  - `session.ts` / `session-store.ts` (shopper session), `fingerprint.ts`, `i18n.ts`, `detail.ts`.

- `frontend/src/app/globals.css` and Tailwind configuration at `tailwind.config.ts`.

Reusable vs legacy:
- Reusable: `src/components/*`, `src/lib/*` (api, admin client), `AdminShell`/layout.
- Legacy/replaced: references to a deleted prior `lib/admin.ts` (now replaced by `admin/client.ts`); `.next` build artifacts are derived not source.

---

**Report 3 — Exact API contracts (selected entities)**

Notes: request/response schemas refer to backend Pydantic models located under `backend/app/modules/*/schemas.py`. Authentication: endpoints under `/admin` require owner auth (Bearer access token). Paging uses query params `page` and `size` (server Paging dependency). Language is provided via `lang` query or Accept-Language; the frontend app appends `?lang=en` or `lang=...`.

Categories
- GET `/categories` (public)
  - Query: none
  - Auth: none
  - Response: list of `CategoryNode` { id, slug, name, icon_url, display_order, children[] }
- GET `/categories/{slug}` (public)
  - Response: `CategoryNode`
- GET `/admin/categories` (owner)
  - Response: list of `CategoryAdmin` { id, slug, name_en, name_ar, icon_url, parent_id, display_order, is_active }
- POST `/admin/categories` (owner)
  - Body: `CategoryWrite` { name_en, name_ar?, parent_id?, display_order?, is_active? }
  - Response: `CategoryAdmin` (201)
- PATCH `/admin/categories/{id}` (owner)
  - Body: `CategoryWrite` (full shape used for update)
  - Response: `CategoryAdmin`
- DELETE `/admin/categories/{id}` (owner)
  - Response: 204 or 409 (conflict) when not empty
- POST `/admin/categories/{id}/icon` (owner)
  - Body: multipart file upload (form field `file`)
  - Response: `CategoryAdmin` (validates size & mime; 413/415 possible)

Products
- GET `/products` (public)
  - Query: `page`, `size`, `category` (slug), `kind` (shelf|workshop), `q`, `seed`
  - Response: `ProductPage` { items: ProductCard[], total, page, size, has_more }
  - ProductCard: { id, slug, kind, title, price, price_max, image, category_slug, category_name, available, lead_time_days }
- GET `/products/{slug}` (public)
  - Response: `ProductDetail` (includes images: MediaResponse[], variants: VariantOut[], pieces: PieceOut[])
- GET `/admin/products` (owner)
  - Query: `page`, `size`, `status` (filter), `kind`
  - Response: list[`ProductAdmin`]
- POST `/admin/products` (owner)
  - Body: `ProductWrite` (kind, title_en, title_ar, description_en/ar, story_en/ar, price, category_id?, status, made_on?, batch_closed?, show_piece_numbers?, lead_time_days?, price_max?)
  - Response: `ProductAdmin` (201). Server enforces: publishing requires at least one photo; workshop requires `lead_time_days`.
- PATCH `/admin/products/{product_id}` (owner)
  - Body: `ProductPatch` (partial updates) → Response `ProductAdmin`.
- DELETE `/admin/products/{product_id}` (owner) → 204 (marks archived).

Variants
- POST `/admin/products/{product_id}/variants` (owner)
  - Body: `VariantWrite` { sku, option_en, option_ar?, price?, display_order?, is_active? }
  - Response: `VariantOut` { id, sku, option, price, available }
- DELETE `/admin/variants/{variant_id}` (owner) → 204 (sets is_active=false)

Pieces
- GET `/admin/products/{product_id}/pieces` (owner)
  - Response: list[`PieceAdmin`] { id, number, batch_size, label, state, variant_id, made_on, photo_url, note_en, note_ar }
- POST `/admin/products/{product_id}/pieces` (owner)
  - Body: `PieceBatchWrite` { quantity, variant_id?, made_on?, note_en?, note_ar? }
  - Response: list[`PieceAdmin`] (201). Validations: product.kind must be `shelf`, batch_closed false.
- DELETE `/admin/pieces/{piece_id}` (owner) → 204 (only when piece.state == available)
- GET `/admin/products/{product_id}/waiting` (owner)
  - Response: { waiting: number }

Media
- POST `/admin/products/{product_id}/media` (owner)
  - Body: multipart file + optional query params `alt_en`, `alt_ar`, `is_process_footage`
  - Response: `MediaResponse` { id, url, alt, is_primary, is_process_footage, sort_order } (201)
- POST `/admin/media/{media_id}/primary` (owner) → returns `MediaResponse` after toggling primary
- DELETE `/admin/media/{media_id}` (owner) → 204 (validations: published product must keep at least one photo)

Orders
- POST `/orders` (public checkout)
  - Body: `CheckoutRequest` { full_name, phone, email?, address: {line1, city, notes?}, lang, items: [{product_id, variant_id?, quantity}] }
  - Response: `OrderResponse` (201)
- POST `/orders/find` (public)
  - Body: `FindOrder` { reference, phone } → `OrderResponse` or 404
- GET `/orders/track/{tracking_token}` (public) → `OrderResponse` (no auth; token is credential)
- GET `/admin/orders` (owner)
  - Query: `page,size,status,q` → list[`OrderResponse`]
- GET `/admin/orders/{reference}` (owner) → `OrderResponse`
- POST `/admin/orders/{reference}/status` (owner)
  - Body: `StatusChange` { status, note? } → returns `OrderResponse` (server enforces allowed transitions)

Requests (custom quotes)
- POST `/requests` (public)
  - Body: `RequestCreate` { full_name, phone, email?, city?, description, category_id?, budget?, references: string[], lang, product_id?, source }
  - Response: `RequestOut` (201)
- POST `/requests/references` (public)
  - Body: multipart file upload → returns { url } (201)
- GET `/requests/track/{tracking_token}` (public) → `RequestOut`
- POST `/requests/track/{tracking_token}/approve` (public)
  - Body: Approval { address, note? } → `RequestOut` (turns into order)
- GET `/admin/requests` (owner) → list[`RequestOut`]
- GET `/admin/requests/{reference}` (owner) → `RequestOut`
- POST `/admin/requests/{reference}/quote` (owner)
  - Body: `Quote` { price, lead_time_days, note_en, note_ar } → `RequestOut`
- POST `/admin/requests/{reference}/status` (owner)
  - Body: `RequestStatusChange` { status, note? } → `RequestOut`

Customers
- GET `/admin/customers` (owner)
  - Query: `page,size,q?` → returns list of customer summary objects (constructed from orders; see `app/modules/admin/customers.py`).
- PATCH `/admin/customers/{user_id}/active` (owner)
  - Body: { active: boolean } → returns `User` updated (id, is_active, etc.)

Errors & validation
- Most endpoints return JSON error bodies with `detail` text (Pydantic/HTTPException). File uploads may return 413 (payload too large) or 415 (unsupported media type). Authorization failures return 401/403.

---

**Report 4 — Data models (fields & relationships, essential fields only)**

Key models and their important fields (based on `backend/app/models/*.py`):

- Category (`categories`)
  - id, parent_id, slug, name_en, name_ar, icon_url, display_order, is_active
  - relationships: `children`, `products`

- Product (`products`)
  - id, kind (`shelf|workshop`), slug, category_id
  - bilingual text: `description_en/ar`, `story_en/ar`, `title_en/ar` (title lives in write schema),
  - price, price_max (workshop), status (`draft|active|paused|archived`), business_boost
  - shelf-only: `made_on`, `batch_closed`, `show_piece_numbers`
  - workshop-only: `lead_time_days`
  - relationships: `media` (ProductMedia[]), `variants` (ProductVariant[]), `pieces` (Piece[]), `embedding` (ProductEmbedding)

- ProductVariant (`product_variants`)
  - id, product_id, sku, option_en/ar, price (nullable), display_order, is_active
  - relationship: `pieces` (Piece[])

- Piece (`pieces`)
  - id, product_id, variant_id?, number, batch_size, state (`available|reserved|sold|kept`), made_on, photo_url, note_en/ar

- ProductMedia (`product_media`)
  - id, product_id, url, alt_en/ar, is_process_footage, is_primary, sort_order

- Order (`orders`)
  - id, reference, tracking_token, customer_id?, customer_name, customer_phone, customer_email, lang, address (JSON), city
  - subtotal, delivery_fee, total, status (enum), note
  - relationships: `items` (OrderItem[]), `events` (OrderEvent[])

- OrderItem (`order_items`)
  - id, order_id, product_id (FK), variant_id?, piece_id?, title (snapshot), variant_label, piece_label, lead_time_days?, unit_price, quantity, subtotal, image_url

- CustomRequest (`custom_requests`)
  - id, reference, tracking_token, customer_id?, customer_name, customer_phone, customer_email, lang, city, description, budget, references (JSON list of URLs), category_id?, source, product_id?, status, quote_price?, quote_note_en/ar, lead_time_days?, promised_for, order_id?

- ContactMessage (`contact_messages`)
  - id, name, email?, phone?, message, created_at, read_at

- User (`users`)
  - id, email, phone, full_name, password_hash, role (`owner|customer`), is_active, lang, avatar_url, address_line1, city, refresh_tokens relationship

Relationships summary: Product -> many Media/Variants/Pieces. Category -> many Products and self-referencing parent/children. Order -> many OrderItems and Events. CustomRequest may point to Product and may create an Order when approved.

---

**Report 5 — Authentication & session (frontend ↔ backend flow)**

Overview:
- Two separate auth flows exist: shopper accounts (customer) and owner (admin) account. They are intentionally separate and stored independently on the client.

Shopper (customer) flow (frontend):
- Sign-in/register uses `POST /auth/login` and `POST /auth/register` (storefront code calls these via `frontend/src/lib/session.ts`).
- Access token (short-lived) stored in local/session store via `session-store.ts` (`sessionToken()` used by `api.ts` to send `Authorization: Bearer <token>` for customer-scoped endpoints).
- The app sends `x-visitor-id` header (fingerprint) on many requests to tie anonymous behaviour to a visitor id (`frontend/src/lib/fingerprint.ts`).
- The server verifies tokens using `decode_token` and `Deps.current_user_optional` / `current_user` to populate `User` for endpoints.

Owner (admin) flow (frontend):
- Admin uses owner tokens stored in `sessionStorage` (not localStorage) via `frontend/src/lib/admin/session.ts` keyed with `mostyle_owner_token` and a refresh token `mostyle_owner_refresh`.
- Admin API client `frontend/src/lib/admin/client.ts` calls `call()` in `admin/session.ts` which attaches `Authorization: Bearer <ownerToken>` and handles 401 by attempting a single refresh to `/api/auth/refresh`, then replaying the request.
- On failed refresh or 403 the session is cleared and `NotSignedIn` is thrown; `AdminShell` shows the sign-in form when no owner token exists.

Backend enforcement (server):
- `backend/app/deps.py` defines `Owner = Annotated[User, Depends(require_owner)]` and `require_owner` checks `user.role is UserRole.owner` or raises 403.
- Token verification: `decode_token` validates access token signature and expected_type. `_user_from_credentials` loads user from DB and checks `is_active`.
- Admin endpoints declare `owner: Owner` dependency: this ensures only an active owner account can access `/admin/*` endpoints.

Session specifics & security notes:
- Owner tokens: access tokens are short-lived; refresh tokens are stored in `sessionStorage` and spendable once; client code serializes `renew()` to prevent concurrent refresh token usage.
- Shopper tokens: stored via `session-store.ts`, used to attach `Authorization` to requests; some public endpoints rely on `x-visitor-id` instead of user identity.
- Public tokenless flows: order tracking (`/orders/track/{token}`) and request tracking use long random tokens as bearer credentials — they are intentionally unauthenticated endpoints keyed by token value.

---

Files consulted (representative):
- Frontend: `frontend/package.json`, `frontend/next.config.ts`, `frontend/tsconfig.json`, `frontend/tailwind.config.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/admin/client.ts`, `frontend/src/lib/admin/session.ts`, `frontend/src/lib/session.ts`, `frontend/src/components/charts.tsx`, `frontend/src/app/admin/AdminShell.tsx`, `frontend/src/app/admin/management/page.tsx`, `frontend/src/components/*`.
- Backend: `backend/app/modules/catalog/routes.py`, `backend/app/modules/catalog/schemas.py`, `backend/app/models/catalog.py`, `backend/app/modules/orders/routes.py`, `backend/app/modules/orders/schemas.py`, `backend/app/modules/requests/routes.py`, `backend/app/modules/requests/schemas.py`, `backend/app/modules/contact/routes.py`, `backend/app/deps.py`.

If you want: I can now (pick one)
- export a machine-friendly JSON mapping of `admin.client` functions → `method+path+request/response schema` for your frontend or mobile team, or
- scaffold a small OpenAPI fragment for the admin endpoints we covered, or
- generate TypeScript API types + a single-file client from the Pydantic schemas.
