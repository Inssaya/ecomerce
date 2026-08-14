ADMIN — Page-by-page diagnostic (routes + handler names + backend functions used)

NOTE: This file lists every admin-facing page/route (handler function name) and the backend service/helper functions called by that handler or by the admin flows. Use these function names when wiring the frontend to the backend.

---

1) Admin Dashboard / Control Room
- Routes & handlers (file: backend/app/modules/admin/routes.py):
  - GET `/admin/pulse` -> handler: `pulse`
    - Calls: `app.modules.admin.metrics.pulse`
  - GET `/admin/decide` -> handler: `decide`
    - Calls: `app.modules.admin.metrics.what_to_make_next`, `app.modules.admin.metrics.shelf_state`, `app.modules.admin.metrics.best_sellers`
  - GET `/admin/money` -> handler: `money`
    - Calls: `app.modules.admin.metrics.revenue`, `app.modules.admin.metrics.refusals`, `app.modules.admin.metrics.conversion`
  - GET `/admin/analytics` -> handler: `analytics`
    - Calls: `app.modules.admin.analytics.overview` (which itself calls `audience`, `funnel`, `by_page`, `by_product`, `unmet_demand`)
  - GET `/admin/forecast` -> handler: `forecast_next_week`
    - Calls: `app.modules.admin.forecast.next_seven_days`
  - GET `/admin/customers` -> handler: `customers`
    - Calls: `app.modules.admin.customers.list_customers`
  - PATCH `/admin/customers/{user_id}/active` -> handler: `set_customer_active`
    - Calls: `app.modules.admin.customers.set_customer_active`
  - GET `/admin/explain` -> handler: `explain`
    - Reads: `app.modules.admin.metrics.KPI_EXPLANATIONS`

2) Catalog / Categories
- Routes & handlers (file: backend/app/modules/catalog/routes.py):
  - GET `/admin/categories` -> handler: `list_categories_admin`
    - Underlying helpers: `app.modules.catalog.service.with_relations`, `app.modules.catalog.service.build_tree` (for public tree)
  - POST `/admin/categories` -> handler: `create_category`
    - Calls: `app.core.slug.unique_slug` (to build slug), DB create/commit of `Category`
  - PATCH `/admin/categories/{category_id}` -> handler: `update_category`
    - Calls: `app.core.errors.get_or_404`, updates Category fields
  - DELETE `/admin/categories/{category_id}` -> handler: `delete_category`
    - Checks: child categories/products via SQL; calls `app.core.storage.delete_object` if icon removed
  - POST `/admin/categories/{category_id}/icon` -> handler: `upload_category_icon`
    - Uses: `file.read()`, `app.core.storage.sniff_image`, `app.core.storage.upload_image`, `app.core.storage.delete_object`
  - DELETE `/admin/categories/{category_id}/icon` -> handler: `remove_category_icon`
    - Uses: `app.core.storage.delete_object`
- Catalog service-level functions (useful for UI or frontend shaping):
  - `app.modules.catalog.service.build_tree`
  - `app.modules.catalog.service.descendant_ids`
  - `app.modules.catalog.service.with_relations`
  - `app.modules.catalog.service.visible`
  - `app.modules.catalog.service.to_admin`, `to_card`, `to_detail`, `variants_out`, `media_out`, `primary_image`, `availability`, `variant_availability`, `text_match`
- Alerts related to products:
  - `app.modules.catalog.alerts.add`, `announce`, `waiting_for`

Frontend inspection — files checked: `frontend/src/app/admin/**`, `frontend/src/lib/admin/**`, `frontend/src/components/**`, `frontend/src/lib/session.ts`, `frontend/src/app/admin/layout.tsx`

Chapters diagnostic (frontend)

- Admin routes:
  - Pages present: `/admin` (dashboard), `/admin/management`, `/admin/orders`, `/admin/users`, `/admin/assistant`.
  - Handlers/pages located in `frontend/src/app/admin/*.tsx` and `frontend/src/app/admin/*/page.tsx`.

- Pages:
  - `frontend/src/app/admin/page.tsx` — Dashboard: calls `admin.pulse`, `admin.money`, `admin.analytics`, `admin.forecast`, `admin.explain` via `frontend/src/lib/admin/client.ts`.
  - `frontend/src/app/admin/management/page.tsx` — Catalog management: categories, products list, create/edit flows.
  - `frontend/src/app/admin/orders/page.tsx` — Orders + requests + contact messages management.
  - `frontend/src/app/admin/users/page.tsx` — Customers listing and activation.
  - `frontend/src/app/admin/assistant/page.tsx` — Copilot UI calling `admin.copilot`.

- Components:
  - `frontend/src/components/*` contains shared UI: tables, charts, modals, file inputs, forms. Key components used by admin pages include `charts.tsx`, `MediaUpload` (in management), `ConfirmDialog` (modal), `Table` and `Filters` patterns inside management and orders pages.

- Layouts:
  - `frontend/src/app/admin/layout.tsx` wraps admin pages with `AdminShell` (sidebar + sign-in). `AdminShell` handles sign-in state and sign-out.

- Navigation:
  - `AdminShell` defines the admin nav links. Active link detection uses `usePathname()`.

- Forms:
  - Category create/edit form in `management/page.tsx` (native HTML inputs + `admin.createCategory` / `admin.updateCategory`).
  - Product create/edit flows use JSON bodies via `admin.createProduct` and `admin.updateProduct` (the forms are large and built inline in management page).

- Tables:
  - Orders, requests, customers and products use simple mapped `array.map()` tables with manual filtering and pagination (size param 60 used in API calls). No dedicated table abstraction found beyond ad-hoc markup in each page.

- Filters:
  - Client-side filters exist (status, q, kind), passed to `admin` client calls as query params. No centralized filter component.

- Modals:
  - Custom confirm modal used; file-picker modal uses native file input. Some inline modals exist inside `management/page.tsx`.

- API calls:
  - Centralized in `frontend/src/lib/admin/client.ts` as `admin` object — one function per backend admin endpoint.

- State management:
  - Local React state (useState/useEffect/useCallback) per page. No global state library for admin pages. Server state cached only in local state; pages re-fetch on mount.

- Authentication/authorization:
  - Admin owner token handled in `frontend/src/lib/admin/session.ts`. `AdminShell` checks `ownerToken()` to show sign-in or shell. API calls set `Authorization: Bearer <ownerToken>` via `call()` helper.

- Responsive behavior:
  - `AdminShell` layout uses responsive classes (`lg:`) to collapse sidebar on small screens. Pages are responsive using Tailwind classes.

- Existing design system:
  - Tailwind + custom `btn-primary`, `field`, `page` classes. Shared helpers in `frontend/src/components` for charts and common UI.

- Duplicate components:
  - Some ad-hoc duplicated markup for tables and forms across admin pages; no single `DataTable` or `Form` abstraction.

- Dead/unused files:
  - `.next` cache contains built artifacts; no clear dead-file list without deeper static analysis. Some commented or legacy code references to a deleted `lib/admin.ts` indicate prior refactor; file `frontend/src/lib/admin/client.ts` replaces it.

- Bad architecture:
  - No central state or query caching (e.g., React Query). Re-fetching on mount may cause redundant calls.
  - Large `management/page.tsx` does many things (categories, products, variants, pieces) — consider splitting into smaller components/pages.

- Missing pages:
  - No explicit media library page; media management occurs inline in product editor.
  - No dedicated inventory audit/history page (backend lacks audit log endpoints as noted).

- Inconsistent UX:
  - Confirm flows and error handling are ad-hoc; some actions prompt confirmations, others rely on toast messages.
  - Modals and inline editors use different patterns across pages.

- Backend/frontend mismatches:
  - Frontend `admin.client` maps closely to backend endpoints discovered; most endpoints present. The backend offers feed weight endpoints and embeddings (`/admin/feed/weights`, `/admin/feed/embeddings`) and AI/copilot `/admin/copilot` which the frontend uses (`admin.copilot`).
  - Some backend helper functions (e.g., `app.modules.catalog.service.descendant_ids`, `app.modules.feed.engine.*`, `app.modules.catalog.alerts.*`) are not directly exposed as endpoints; frontend may need to call existing endpoints instead of helpers.

Summary: The frontend already implements most admin pages and uses `frontend/src/lib/admin/client.ts` as a single source of truth for API calls. Gaps to address for a more maintainable admin frontend: extract shared table/form components, add centralized data fetching/caching, split `management` into subpages (categories/products/media), add media library and audit/inventory pages, and make modals and confirm patterns consistent.

---

I'll now mark progress in the TODO list: fleshed out frontend diagnostic. If you want, I can produce a JSON mapping of UI actions to API endpoints (from `admin.client`) for your React Native team, or begin scaffolding the React Native components mirroring the existing pages.


3) Products, Variants, Pieces, Media
- Routes & handlers (file: backend/app/modules/catalog/routes.py):
  - GET `/admin/products` -> handler: `list_products_admin`
    - Uses: `service.with_relations`, `service.to_admin`, `service.availability`
  - POST `/admin/products` -> handler: `create_product`
    - Uses: `unique_slug`, DB create, background task -> `app.modules.catalog.routes._reembed` which calls `app.modules.feed.embeddings.refresh`
  - PATCH `/admin/products/{product_id}` -> handler: `update_product`
    - Uses: `get_or_404`, validations (photo required before publishing), updates fields, triggers `_reembed`
  - DELETE `/admin/products/{product_id}` -> handler: `archive_product`
    - Marks Product.status = archived (soft-delete)
  - POST `/admin/products/{product_id}/variants` -> handler: `add_variant`
    - Creates `ProductVariant`; checks SKU uniqueness
  - DELETE `/admin/variants/{variant_id}` -> handler: `retire_variant`
    - Sets `ProductVariant.is_active = False`
  - GET `/admin/products/{product_id}/pieces` -> handler: `list_pieces`
    - Returns `PieceAdmin` objects
  - POST `/admin/products/{product_id}/pieces` -> handler: `add_pieces`
    - Creates many `Piece` rows, updates `batch_size`, calls `app.modules.catalog.alerts.announce` to notify waiting users
  - DELETE `/admin/pieces/{piece_id}` -> handler: `remove_piece`
    - Deletes piece if allowed, recalculates batch_size
  - GET `/admin/products/{product_id}/waiting` -> handler: `who_is_waiting`
    - Calls: `app.modules.catalog.alerts.waiting_for`
  - POST `/admin/products/{product_id}/media` -> handler: `upload_product_photo`
    - Uses: `sniff_image`, `upload_image`, creates `ProductMedia`, sets `is_primary` logic
  - POST `/admin/media/{media_id}/primary` -> handler: `set_primary_photo`
    - Clears `is_primary` on siblings, sets on target
  - DELETE `/admin/media/{media_id}` -> handler: `delete_photo`
    - Deletes media, enforces "published product must have at least one photo", reassigns primary if needed, calls `delete_object`
- Catalog service functions (repeated for clarity):
  - `to_admin`, `to_card`, `to_detail`, `availability`, `variant_availability`, `variants_out`, `primary_image`, `media_out`, `build_tree`, `descendant_ids`, `text_match`
- Embeddings and background re-embedding:
  - `app.modules.feed.embeddings.source_text`, `source_hash`, `refresh`, `embed_query`

4) Orders (admin)
- Routes & handlers (file: backend/app/modules/orders/routes.py):
  - GET `/admin/orders` -> handler: `list_orders`
  - GET `/admin/orders/{reference}` -> handler: `get_order`
  - POST `/admin/orders/{reference}/status` -> handler: `set_status`
    - Calls: `app.modules.orders.service.change_status`
- Orders service functions (file: backend/app/modules/orders/service.py):
  - `place_order` (used by public checkout)
  - `change_status` (used by admin to move orders)
  - `release_stale_reservations` (clean-up before placing)
  - `delivery_fee_for`
  - Internal helpers: `_take_pieces`
- Notification helpers used after changes:
  - `app.modules.notify.service.notify_order_status` and `app.modules.notify.service.order_track_url`

5) Requests (custom quotes / admin actions)
- Routes & handlers (file: backend/app/modules/requests/routes.py):
  - POST `/requests` -> handler: `create_request` (public)
    - Calls: `app.modules.requests.service.raise_request`
  - POST `/requests/references` -> handler: `upload_reference` (public file upload)
  - GET `/requests/track/{tracking_token}` -> handler: `track_request`
  - POST `/requests/track/{tracking_token}/approve` -> handler: `approve_quote` (public flow to approve quote)
    - Calls: `app.modules.requests.service.approve`
  - POST `/requests/track/{tracking_token}/withdraw` -> handler: `withdraw`
- Admin routes:
  - GET `/admin/requests` -> handler: `list_requests`
  - GET `/admin/requests/{reference}` -> handler: `read_request`
  - POST `/admin/requests/{reference}/quote` -> handler: `send_quote`
    - Calls: `app.modules.requests.service.quote`
  - POST `/admin/requests/{reference}/status` -> handler: `move_request`
    - Calls: `app.modules.requests.service.change_status`
- Requests service functions (file: backend/app/modules/requests/service.py):
  - `raise_request`, `quote`, `approve`, `change_status`
  - Uses: `app.modules.orders.service.delivery_fee_for`, `app.modules.notify.service.notify_request_status`

6) Contact Messages
- Routes & handlers (file: backend/app/modules/contact/routes.py):
  - POST `/contact` -> handler: `send_message` (public)
  - GET `/admin/contact-messages` -> handler: `list_messages`
  - POST `/admin/contact-messages/{message_id}/read` -> handler: `mark_read`
- Underlying model: `app.models.contact.ContactMessage`

7) Feed / Signals / AI support
- Routes & handlers (file: backend/app/modules/feed/routes.py):
  - POST `/signals` -> handler: `record_signals`
    - Calls: `app.modules.feed.service.record` (per-signal storage)
  - GET `/feed` -> handler: `feed`
    - Calls: `app.modules.feed.engine.page` (returns product list + explore ratio)
  - GET `/admin/feed/weights` -> handler: `read_weights`
    - Calls: `app.modules.feed.engine.weights`
  - PUT `/admin/feed/weights` -> handler: `set_weights`
    - Calls: `app.modules.feed.engine.weights` and updates `FeedWeight`
  - POST `/admin/feed/embeddings` -> handler: `refresh_embeddings`
    - Calls: `app.modules.feed.embeddings.refresh`
- Feed engine/service functions:
  - `app.modules.feed.engine.weights`, `score_all`, `arrange`, `page`, `signal_mass`, `explore_ratio`
  - `app.modules.feed.service.weight_for`, `dwell_weight`
  - Embeddings: `source_text`, `source_hash`, `refresh`, `embed_query`

8) AI / Assistants (admin copilot + storefront assistant)
- Routes & handlers (file: backend/app/modules/ai/routes.py):
  - POST `/assistant` -> handler: `ask_assistant` (public shopper assistant)
    - Uses toolbox: `app.modules.ai.shopper.build` (functions: `search_products`, `get_product`, `get_recommendations`, etc.)
  - POST `/admin/copilot` -> handler: `ask_copilot` (owner's copilot)
    - Uses: `app.modules.ai.copilot.build` (exposes admin metrics helpers)
- AI toolboxes (files: `ai/shopper.py`, `ai/copilot.py`) export helper functions used by assistants; see those modules for names such as `build`, `get_product`, `what_to_make_next`, `get_pulse`, `get_revenue`, etc.

9) Notifications / Helpers
- Notification module: `backend/app/modules/notify/service.py` exposes:
  - `notify_order_status`, `notify_request_status`, `whatsapp_url`, `order_track_url`, and email helpers used by alerts and orders.
- Storage helpers (images/icons): `app.core.storage.upload_image`, `delete_object`, `sniff_image` used by media/icon endpoints.

10) Dependencies and permission guard
- Dependency helpers in `backend/app/deps.py` that affect admin endpoints:
  - `Owner` (Annotated[User, Depends(require_owner)]) — enforces `User.role is UserRole.owner` (used as `owner: Owner` parameter on admin routes)
  - `CurrentUser`, `OptionalUser`, `Lang`, `Paging`, `Visitor`

---

Files and code locations checked (representative list):
- `backend/app/modules/catalog/routes.py` (all admin catalog handlers)
- `backend/app/modules/catalog/service.py` (helpers: `to_admin`, `to_detail`, `availability`, etc.)
- `backend/app/modules/catalog/alerts.py` (`add`, `announce`, `waiting_for`)
- `backend/app/modules/orders/routes.py`, `backend/app/modules/orders/service.py` (`place_order`, `change_status`, `_take_pieces`, `release_stale_reservations`)
- `backend/app/modules/requests/routes.py`, `backend/app/modules/requests/service.py` (`raise_request`, `quote`, `approve`, `change_status`)
- `backend/app/modules/contact/routes.py` (contact admin handlers)
- `backend/app/modules/feed/routes.py`, `backend/app/modules/feed/engine.py`, `backend/app/modules/feed/embeddings.py` (feed/embeddings/weights)
- `backend/app/modules/admin/routes.py`, `backend/app/modules/admin/metrics.py`, `backend/app/modules/admin/analytics.py`, `backend/app/modules/admin/customers.py`, `backend/app/modules/admin/forecast.py`
- `backend/app/modules/ai/routes.py`, `backend/app/modules/ai/copilot.py`, `backend/app/modules/ai/shopper.py`
- `backend/app/deps.py` (Owner and auth dependencies)
- `backend/app/core/storage.py`, `backend/app/core/slug.py`, `backend/app/core/errors.py` (helpers used throughout)

---

Status: I scanned routes and key service/helper modules. The report lists handler names (routes) and the backend functions they call so your frontend team can map UI actions to API endpoints and, if needed, call supporting helper endpoints (e.g., `/admin/feed/embeddings`) or understand background side-effects (embedding refresh, notify hooks).

Next steps (pick one):
- I can produce a machine-friendly list (JSON or OpenAPI fragment) mapping each admin UI action to `method + path + handler + called services` for direct consumption by your frontend team, or
- I can scaffold the `frontend/src/admin/` pages (React/Next) with components wired to these endpoints (no backend code changes), or
- I can add missing admin endpoints (inventory adjustments, audit log, bulk-import) to the backend.

Tell me which next step you want. If none, confirm and I'll finalize this report file.
