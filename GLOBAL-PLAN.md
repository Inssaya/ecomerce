# M-StyLe Console Rebuild — Global Plan

One agent, four sessions. This file is the memory between them: a session starts by reading
this file and nothing else, does its slice, then writes its summary into §9 at the bottom.

**Source of truth is `requirementMOdification.md`.** Nothing in this repo's other plans,
reports or design docs is direction. If this file ever contradicts that spec, the spec wins.

---

## 1. Rules that hold for every session

- **Do not restyle.** The current console look — palette, type, spacing, the rail,
  `console.css` — is what the owner wants and it stays. New UI is composed from primitives that
  already exist and inherits the existing look. The only CSS anyone writes is a scoped rule for
  something that genuinely has no rule yet (a colour swatch, a red row). No token changes, no
  resets, no "while I was in there".
- **Build only what the spec asks for.** Every table, column, popup and endpoint below traces
  back to a line in `requirementMOdification.md`.
- **No Docker, no migrations run, no test suite.** Write the code, write the summary, stop.
  The owner decides when to build and migrate. Migrations are hand-written files, never
  `--autogenerate`.
- **Every session ends buildable.** Don't leave a half-rewritten page behind. If a slice won't
  fit, cut scope at a working boundary and say so in the summary.
- **Every session ends with a commit and a push** to `ecomerce` /
  `claude/monolith-rebuild-5xzsfl`, so nothing is ever sitting uncommitted again.

---

## 2. Ground truth — verified, not assumed

- Admin lives at `frontend/src/app/admin/`. A side **Rail** with four doors — Board, Orders,
  Assistant, Manage ([AdminShell.tsx:27-32](frontend/src/app/admin/AdminShell.tsx#L27-L32)).
  Sub-sections are real routes switched by `SectionSwitch` / `ManageSwitch`.
- Each page renders its own [`ControlStrip`](frontend/src/app/admin/ui/primitives.tsx#L131) —
  that is the "top header" the spec talks about. There is no global header component yet.
- All styling is scoped under `.console` in
  [console.css](frontend/src/app/admin/console.css) (981 lines). **A popup portaled to
  `document.body` renders as unstyled raw text.** Everything portals into `.console`. This is
  the signature failure of this codebase — check it every time.
- The kit already has `DataTable` + `useTableSort`, `Drawer`, `ConfirmProvider` / `useConfirm`,
  `Pill`, `Money`, `Age`, `SearchInput`, `Segmented`, `EmptyState`, `useDebounced`
  ([primitives.tsx](frontend/src/app/admin/ui/primitives.tsx)).
- Manage · Pieces is today a two-pane split: a scannable list plus
  [`PieceInspector`](frontend/src/app/admin/manage/PieceInspector.tsx) (614 lines — photos,
  words, batch, variants).
- Customers are **not** rows in `users`. They are `coalesce(customer_id, customer_phone)`
  buckets walked in Python over `orders`
  ([customers.py:38-124](backend/app/modules/admin/customers.py#L38-L124)).
- SMTP already works — `send_email` in
  [notify/email.py](backend/app/modules/notify/email.py). Nobody builds a mailer.
- Client IP extraction already exists —
  [limits.py:35-45](backend/app/core/limits.py#L35-L45).
- Migration head is `20260811_1900_archive_contact_messages`, revision `c3f1a8b52d64`.

---

## 3. Settled decisions

### D1 — Attributes: three groups, one shape, suggestion lists
The owner's spec, exactly: a product carries **measures**, **colours** and **materials**. It can
carry all three, or one, or none. Two shapes cover all of it:

- **typed** — `name → value`: `Width → 10 cm`, `Height → 50 cm`. The name comes from a
  suggestion list or is typed fresh; **the value is free text**, unit included as the admin
  typed it. No unit column, no parsing, no maths on it.
- **plain** — value only, no name: `M`, `L`, `XL`, `Cotton 100%`, `Wood`.

Colours are the same shape with a hex alongside, rendered as a **circle** on the storefront.

**Suggestions**, per group, offered in a dropdown the admin can also type past:
- measure names: Width, Height, Length, Depth, Diameter, Weight
- measure plain values: S, M, L, XL, XXL
- colours: a starter palette of named colours with hex
- materials: Wood, Metal, Cotton 100%, Leather, Plastic, Glass

The list is **built-in presets ∪ every value already used elsewhere in this shop**, from one
endpoint. So it grows as the owner works, and nobody has to build a settings screen for it.

**The customer sees exactly what the admin entered on that product — nothing else.** No facets,
no filters, no inference.

### D2 — Attributes carry no price and no stock
Only the admin sets the price. Only the admin sets availability. Picking "red / M" checks
nothing and costs nothing extra. Attributes are specification, not inventory.

### D3 — Attributes replace variants as the buyer's choice, and the order must record them
The order modal has to show the "selected product attributes". So the order line stores them:
`OrderItem.selection` is a **frozen JSON snapshot** of what the buyer picked
(`[{group, name, value, hex}]`) — a snapshot, not foreign keys, so relabelling an attribute
next month does not rewrite last month's order.

`ProductVariant` **stays in the database and disappears from the admin UI.** Live orders point
at it. Where an old order has a variant and no selection, the modal shows the variant string.
Dropping the model is a todo, not this work.

### D4 — Personalization is real, and it is the customer's name
Settled shape:
- Admin, per product: a **Personalization** toggle and a **price increase, in percent**, applied
  when the buyer turns it on.
- Customer, on the product page: an optional field, **their name, 20 characters maximum**.
- The order line stores the exact text, and the admin order modal shows it verbatim.
- **Order of operations on price: discount first, then the personalization markup on the
  discounted price.** Stated here because it is genuinely ambiguous and needs one answer.

### D5 — Delivery time: one field, feeding one countdown
- `Product.delivery_days` — set and edited in the Products table and the Open popup, for shelf
  and workshop pieces alike.
- `Order.promised_for` — the date the countdown counts to, admin-editable, defaulted at
  checkout to `order date + max(delivery_days or lead_time_days across the items)`.
- `lead_time_days` keeps its current meaning for workshop pricing copy and the
  `ck_workshop_has_lead_time` constraint. Do not remove it.

### D6 — `Order.visitor_id` is what makes guest data exist
Likes and saves are keyed on the device fingerprint. Customers are grouped by phone number.
Those two never join — so "total saves / total likes" per customer, and the whole customer
behaviour view, would read **zero for every guest**, and guests are most of this shop.
`customers.py:84-86` already admits it cannot attribute dwell to a guest.

Fix: the order records the visitor fingerprint at checkout. The customer aggregation then
collects each bucket's fingerprints and joins likes, saves and behaviour signals through them —
for guests as well as accounts. One column, three features.

### D7 — Discount is one model, read everywhere
`discount_kind` (`percent | fixed`) · `discount_value` · `discount_active`. Per product, off by
default, manually switchable — "that doesn't apply on all products, and we can disable it
manually". `effective_price()` lives on the model so the admin table, the storefront, the cart
and the order total all read the same number. Nothing recomputes it locally.

### D8 — Delete means archive, everywhere
No hard deletes in this work. Orders and custom requests get `hidden_at`; products use the
existing `ProductStatus.archived`. Every Delete = `useConfirm()` → archive → recoverable from a
Hidden/Archived filter in the same table.

Soft-delete is **admin-view only**: `GET /orders/track/{token}` and `POST /orders/find` must not
filter on `hidden_at`. Someone waiting for a package still tracks it.

### D9 — One header primitive
A new `ConsoleHeader` in `primitives.tsx`, added **additively** — `ControlStrip` stays until
every page has moved off it. Three zones, left to right:

```tsx
export function ConsoleHeader({ filters, search, pages, trailing }: {
  filters?: ReactNode;                       // zone 1 — omit entirely to hide it (Messages)
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  pages: { href: string; label: string; active?: boolean }[];   // zone 3
  trailing?: ReactNode;                      // e.g. Manage's "Add" button
}): JSX.Element
```

No page titles. **No "N need attention" pills** anywhere — the owner said so directly.

### D10 — Customer type is one derivation
Guest vs Verified = `has_account`. `customers.py` already derives it; `OrderResponse` exposes
the same flag from `customer_id is not None`. Same two words in both UIs.

### D11 — Blocking (my call, reversible)
Fingerprint block is permanent until lifted. **IP block is optional per block and expires after
24 hours**, because an IP can be a whole household or a café and a permanent ban there punishes
strangers. The block screen is the owner's words: *"You are blocked for security reasons —
contact support on 0623842535, or email mostyle.service@gmail.com."*

### D12 — Log retention (my call, reversible)
`danger` kept forever. `warn` pruned after 90 days, `info` after 30. Pruning is a small query
run on startup, not a scheduler.

### D13 — Category management moves into the Add popup
Manage's quick-pages are `[Products, Customers, Feed]` — categories is no longer a page. The
CRUD moves out of `manage/categories/page.tsx` into a `<CategoryManager/>` used inside the Add
popup. The old route becomes a redirect to `/admin/manage` rather than a dead bookmark.

### D14 — "Custom" is a label, not a route
`SectionSwitch` reads **Custom**; the route stays `/admin/orders/commissions`. Renaming the
folder is churn across imports and bookmarks for nothing visible.

### D15 — Logs is the fifth door
Board · Orders · Assistant · Manage · **Logs**. The rail already folds utilities behind "More"
on phones, so a fifth door makes six phone targets — adjust that breakpoint rule when adding
it, and nothing else.

### D16 — Deferred to `todo.md`, not built
The feed's auto-rotating statistical cohorts, and the Data door's incremental backup. Both are
real ideas; neither is a table this month.

---

## 4. The four sessions

Each is a vertical slice: schema, API and UI for one area, ending in something that works.
Migrations chain in session order — each session's migration sits on the previous one's head.

---

### Session 1 — Catalog spine and the Products table
*The biggest session. Everything else reads what this builds.*

**Backend** — `models/catalog.py`, migration `M1` (`down_revision = "c3f1a8b52d64"`)

| Add | Shape |
|---|---|
| `Product.discount_kind` | `Enum(percent, fixed)`, nullable |
| `Product.discount_value` | `Numeric(10,2)`, nullable |
| `Product.discount_active` | `Boolean`, default `False` |
| `Product.effective_price()` | method — discounted price, or `price` when the discount is null or inactive |
| `Product.delivery_days` | `Integer`, nullable — D5 |
| `Product.personalizable` | `Boolean`, default `False` — D4 |
| `Product.personalization_markup_pct` | `Numeric(5,2)`, default `0` — D4 |
| **`ProductAttribute`** | `id · product_id FK cascade · group Enum(measure\|color\|material) · name String(60) nullable · value String(120) · hex String(7) nullable · display_order Int`. `Product.attributes` relationship, `delete-orphan` |

Endpoints:
- `GET /admin/products` — add `q`, `category_id`, date range, `status`. Response gains
  `updated_at`, `delivery_days`, the discount fields, `personalizable`,
  `personalization_markup_pct`, `attributes[]`, `category_name`, `subcategory_name`.
- `POST | PATCH | DELETE /admin/products/{id}/attributes[/{attr_id}]`
- `GET /admin/attribute-suggestions` — presets ∪ values already in use, grouped (D1).
- `GET /admin/products/{id}/analytics` — views, clicks, add-to-cart over time, from the
  existing aggregation in `modules/admin/analytics.py`.

**Frontend**
- `ConsoleHeader` primitive (D9), plus `DateRangeFilter` and a colour `Swatch`.
- Manage header: **date range · Add button · search · `[Products, Customers, Feed]`**.
- **Products page** — `manage/page.tsx` rewritten. Kill `console-split`. One `DataTable`, every
  header sortable:

  `Photo` · `Created` *(modified date beneath it, small and green, only when it differs)* ·
  `Name` · `Category` · `Sub-category` · `Price` *(struck original + discounted when active)* ·
  `Delivery time` · `Saves` · `Likes` · `Actions`

  Saves and Likes render as `0` this session — session 2 fills them.
- **Open popup** — wide, centred, portaled into `.console`:
  - *Photos* — add / delete / per-image alt text. Lift the working logic from
    [PieceInspector.tsx:271-375](frontend/src/app/admin/manage/PieceInspector.tsx#L271-L375).
  - *Words* — a **language dropdown** (EN/AR) revealing name + description for that language.
    The model keeps its bilingual columns; the dropdown is a UI affordance, not a schema change.
  - *Commerce* — price, discount (kind · value · on/off), delivery time, personalization toggle
    + markup %.
  - *Attributes* — the pill editor from D1: pick a group, pick or type a name, type a value,
    add. Colours get a swatch. Each pill removable.
  - *Reach* — total likes / saves, read-only (session 2).
  - **The batch (1 · 2 · 3) section and the variants section are deleted.**
- **Analytics** action → per-product popup. **Delete** action → confirm → archive.
- **Add popup** — Category (dropdown + add / modify / delete, with modify and delete emphasised
  once a category is selected) → Sub-category (identical) → Product. Add/Modify Product opens
  the *same* Open popup, so there is exactly one product form in the codebase.

**Done when** Manage · Products fully works: sort every column, open a product, edit photos,
words, price, discount, delivery, personalization and attributes, and drive
category → sub-category → product from the Add popup.

---

### Session 2 — The storefront side, and the buyer's choices
*What session 1 built becomes visible and buyable.*

**Backend** — migration `M2` (on M1's head)

| Add | Shape |
|---|---|
| **`ProductInteraction`** | `id · product_id FK cascade · kind Enum(like\|save) · visitor_id String(80) · user_id FK nullable · created_at`. Unique `(product_id, visitor_id, kind)` — makes the toggle idempotent |
| `Order.visitor_id` | `String(80)`, nullable, indexed — D6 |
| `OrderItem.selection` | `JSON`, nullable — the frozen attribute snapshot, D3 |
| `OrderItem.personalization` | `String(20)`, nullable — D4 |

- Public: `POST /products/{id}/like` · `POST /products/{id}/save` (toggle, keyed on the
  fingerprint the feed already sends) · `GET /products/{id}/interactions` (this visitor's state
  + totals).
- `total_likes` / `total_saves` join into the admin product list — session 1's zeroes go live.
- Checkout: accept `selection` and `personalization` per line; compute the line price as
  `effective_price()` then `× (1 + markup/100)` when personalization is on (D4); store
  `visitor_id`.

**Frontend — storefront**, `frontend/src/app/[lang]/`
- **Discount** on `piece/[slug]/PieceView.tsx` and product cards: struck original, reduced
  price, badge — **only when `discount_active`**.
- **Attributes** rendered exactly as entered: colours as circles, measures and materials as
  labelled chips. Nothing inferred.
- **Personalization**: optional field, 20-character limit, with the price change shown honestly
  before it is added to the cart.
- **Heart and Save** buttons, optimistic toggle, using the existing fingerprint.
- Checkout sends the selection, the personalization text and the fingerprint.

**Done when** a buyer can see a discounted price, pick attributes, add their name, and heart or
save a piece — and all of it survives a reload and lands on the order.

---

### Session 3 — Order door
**Backend** — migration `M3` (on M2's head)

| Add | Shape |
|---|---|
| `Order.promised_for` | `Date`, nullable — D5 |
| `Order.hidden_at` | `DateTime(tz)`, nullable — D8 |
| `CustomRequest.hidden_at` | `DateTime(tz)`, nullable |

- `GET /admin/orders` — add `city`, date range, `hidden` (default excludes hidden).
- `GET /admin/orders/cities` — distinct cities across non-hidden active orders, feeding the
  dynamic City filter.
- `POST /admin/orders/{reference}/promise` · `/hide` · `/unhide`.
- `OrderResponse` gains `promised_for`, `has_account`, `hidden`. `OrderItemResponse` gains
  `category`, `subcategory`, `selection`, `personalization`. `visitor_id` is **never** exposed.
- `GET /admin/requests` — add `category_id`, date range, `hidden`. `RequestOut` gains
  `category_name`, `hidden`. `POST /admin/requests/{id}/hide` · `/unhide`.
- Status change keeps the existing auto-email and the one-tap `wa.me` link. Optionally add
  `promised_for` to the email copy.

**Frontend**
- `ConsoleHeader` on all three sub-pages. **Messages passes no `filters` prop at all**, which
  hides zone 1 — that is the spec's "hides them if not applicable". Quick-pages
  `[Orders, Custom, Messages]`.
- **Orders table**: `Date` · `Ref` · `Customer` · `City` · `Product` *(all items consolidated
  into one cell — one row per order)* · `Qty` *(summed)* · `Total` · `Delivery countdown` ·
  `Status` · `Actions (Open, Delete)`. Every header sortable.
- **A cancelled order's whole row turns red** — one scoped rule,
  `.console-row-cancelled { color: var(--danger); }`.
- Filters: date range · status incl. Cancelled · dynamic City · Hidden/Archived toggle.
- **Invoice**: printable view (order, items, totals, customer) via a scoped `@media print`
  block and `window.print()`, from the row and from the modal.
- **Order modal**: customer profile with Guest/Verified; per item Category · Sub-category ·
  **selected attributes**; the personalization text **only when present**; editable
  `promised_for` with a live countdown; `SetStatus` (already auto-emails) and the WhatsApp link.
- **Custom page**: `Date` · `Ref` · `Customer` · `City` · `Category` · `Status` ·
  `Actions (Open, Delete)`. Filters: custom category · status · date range. Modal in the Aptiv
  intervention shape — pill row, key/value detail list (desires, email / phone / WhatsApp),
  reference-photo grid, the existing `QuoteForm` for price and "Ready in X days", and the
  WhatsApp/call triggers.
- **Messages**: unchanged apart from the header.
- Storefront: "Arrives by · X days left" from `promised_for` on the tracking page.

**Done when** the orders table sorts, filters by city and date, shows a countdown, turns a
cancelled row red, hides and restores an order, prints an invoice, and the modal shows the
buyer's attribute choices and their personalization.

---

### Session 4 — Customers, Logs, and the todo
**Backend** — new `models/security.py`, `modules/security/`, migration `M4` (on M3's head)

| Add | Shape |
|---|---|
| **`SecurityEvent`** | `id · created_at · level Enum(info\|warn\|danger) · kind String(40) · message Text · ip String(45) nullable · visitor_id nullable · user_id FK nullable · meta JSON`. Indexed on `created_at` and `(level, created_at)` |
| **`Blocklist`** | `id · created_at · reason Text · ip nullable · visitor_id nullable · expires_at nullable · active Boolean default True`. CheckConstraint: at least one of ip / visitor_id |

- `GET /admin/customers` extended with `total_saves`, `total_likes`, `total_products`,
  `created_at`, `city`, `type` — joined through `Order.visitor_id` (D6).
- `GET /admin/customers/{id}/analytics` — the behaviour view, same join.
- `GET /admin/security/logs?level=&since=` · `GET /admin/security/events/{id}` ·
  `POST /admin/security/block` · `DELETE /admin/security/block/{id}`.
- **Middleware** in `main.py`: an active, unexpired `Blocklist` match on IP or fingerprint →
  `403` with a stable code (`blocked`) the storefront turns into the block screen.
- **Alerting**: a `danger` event sends via the existing `send_email` to
  `yassinsinif4@gmail.com` **and** `Yassine.Sinif@emsi-edu.ma`. **Debounce per `(kind, ip)`** —
  a flood must not become an email flood. Reuse `client_ip()` from `core/limits.py`, and hook
  the rate limiter's 429 path so a burst is what gets recorded.
- Retention pruning per D12.

**Frontend**
- **Customers page** rewritten to a `DataTable`: `Created` · `Name` · `Phone` · `Email` ·
  `Type` · `Total spent` · `Total products` · `Saves` · `Likes` · `Actions`.
  - **Open** → centred popup, not a side panel: full profile — address, city, email, phone,
    type, order history, totals.
  - **Analytics** → behaviour popup: visits, funnel, dwell, liked and saved pieces. Works for
    guests because of D6.
  - **Block** → confirm → account `is_active = false` and/or a `Blocklist` entry.
- **Logs door** — new `admin/logs/`, deliberately plain: `Time` · `Level` · `Kind` · `Message` ·
  `IP`. **Danger rows red.** Row → event detail with the device fingerprint and account, and a
  **Block device** action. No cards, no charts, no chrome — the owner asked for simple.
- Logs added to the rail as the fifth door (D15).
- Storefront: the block screen on a `403 blocked`.
- **Feed page is untouched.**

**Done when** the customers table shows real totals for a guest, Block works, and the logs page
lists events with danger in red and can block a device.

---

## 5. `todo.md` — created in session 4, at the repo root

1. **Feed auto-rotating statistical cohorts** — 5 behavioural stats, 20% buckets, rotating
   weekly. Cold-start first week. Weibull or ML forecast of next-7-day visitors.
   **Ads-period declaration**, so the model separates paid traffic from organic and stops
   hallucinating when the owner buys reach.
2. **Data door** — incremental, query-based daily backup: one evolving backup that new queries
   are pushed into, not sixty full dumps.
3. **Drop `ProductVariant`** once no live order references it (D3).
4. **Real WhatsApp Business API auto-send** — today it is a click-to-chat link.
5. **Dashboard density** — the owner finds the Board dense with low-value numbers.

---

## 6. Verification — for whoever runs Docker and the tests

1. `alembic upgrade head` applies M1 → M4 cleanly, and `downgrade` back to `c3f1a8b52d64` works.
2. `backend/tests/` still green, plus focused cases: attribute CRUD; like/save toggle
   idempotency against the unique constraint; `effective_price()` across percent, fixed,
   inactive and null; personalization markup applied **after** the discount; the block 403;
   order hide/unhide; the city filter; the `promised_for` default at checkout; and — the one
   most likely to be silently broken — **customer aggregation returning non-zero likes and
   saves for a guest** (the D6 path).
3. `npm run build` in `frontend/` — the production build enforces TypeScript, which is where
   type drift surfaces first.
4. Admin pass: every Products column sorts; the Open popup saves photos, words, attributes,
   discount and personalization; the Add popup drives category → sub-category → product; a
   cancelled row is red; delete → Hidden → restore; an invoice prints; Customers
   Open/Analytics/Block work; a danger log row is red and Block device works.
5. Storefront pass: the discount shows only when active; attributes render as entered, colours
   as circles; personalization caps at 20 characters and moves the price; heart and save survive
   a reload on the same fingerprint; a blocked device sees the support screen.
6. Run the `browser-automation` skill on `/admin/manage` and one product page to confirm no
   `.console` portal regressions — a popup rendering as raw unstyled text is the failure this
   codebase produces most often.

---

## 7. Open, and deliberately so

Nothing is blocking. Two calls in §3 are mine rather than the owner's — **D11** (IP blocks
expire after 24 hours) and **D12** (log retention). Both are one-line changes if the owner
disagrees later.

---

## 8. Session log

*Each session appends here before it stops: what I did · what I did not do and why · anything
the next session must know.*

### Session 0 — planning
**Did:** committed and pushed the entire uncommitted console rebuild (96 files) so nothing was
at risk; wrote this plan against `requirementMOdification.md` and the real code.
**Did not:** write any feature code. No schema, no UI, no migrations exist yet from this plan.
**Next session starts at:** Session 1, on a clean tree at
`ecomerce/claude/monolith-rebuild-5xzsfl`.

### Session 1 — catalog spine and the Products table

**Did — backend**
- `models/catalog.py`: `DiscountKind` and `AttributeGroup` enums; on `Product` the three
  discount columns, `delivery_days`, `personalizable`, `personalization_markup_pct`, and the
  methods `effective_price()`, `discount_amount()`, `price_with_personalization()`; new
  `ProductAttribute` model with a `label` property. `ProductVariant` untouched (D3).
- Migration `d41a7c9b6e02` on `c3f1a8b52d64`, hand-written, up and down, following the
  repo's two-form enum convention.
- `catalog/schemas.py`: `AttributeOut` / `AttributeWrite` / `AttributePatch`,
  `AttributeSuggestions` + `ColorSuggestion`, `ProductAnalytics`, the shared `check_discount`,
  and `ProductAdmin` extended with `category_name`, `subcategory_name`, `attributes`,
  `effective_price`, `delivery_days`, personalization, `updated_at`, `total_likes`/`total_saves`.
- `catalog/service.py`: `attribute_out`, `category_names`, `attribute_suggestions` (presets ∪
  what the shop already uses), `LOADED` now eager-loads attributes and the category's parent.
- `catalog/routes.py`: attribute CRUD, `GET /admin/attribute-suggestions`, `q` /
  `category_id` / date-range filters on `GET /admin/products`, discount coherence enforced on
  patch, and `_admin_view` re-reads through `LOADED` with `populate_existing` instead of a
  hand-listed `refresh` (the old list would have raised on the new relationships).
- `admin/analytics.py` + `admin/routes.py`: `for_product` and
  `GET /admin/products/{id}/analytics`.

**Did — frontend**
- `primitives.tsx` (additive): `ConsoleHeader` (D9), `DateRangeFilter`, `Swatch`, `Popup`, and
  `useConsoleHost` / `useOverlayKeys` extracted so the portal-into-`.console` rule is a named
  hook rather than a comment to copy. `ControlStrip` untouched.
- `console.css`: header zones, popup, swatch, spec row, modified-date and struck-price rules,
  plus one phone breakpoint. Additive only — no tokens, no resets, nothing restyled. The popup
  sits at `z-index: 95` so a confirm raised from inside it lands on top.
- `manage/page.tsx` rewritten as a sortable `DataTable`: photo · made (+ green edited date) ·
  name · category · sub-category · price (struck when reduced) · delivery · what it is ·
  saves · likes · actions. No page title, no "need attention" pill.
- New `ProductPopup` (photos · words behind a language dropdown · price/reduction/delivery/
  personalization · attributes · reach), `AttributesEditor`, `AddPopup`
  (category → sub-category → product, with Modify/Delete dull until a row is picked),
  `ProductAnalyticsPopup`.
- `PieceInspector.tsx` deleted. `manage/categories/page.tsx` is now a redirect (D13).
  `ManageSwitch` drops Categories and reads "Products".
- `lib/console/types.ts` + `api.ts`: attribute types, extended `AdminProduct`, `api.products`
  now takes an options object, `productAnalytics`, attribute calls. `BoardControls` updated for
  the new `api.products` signature. `attributeChanged` added to `INVALIDATES`.

**Verified:** `npx tsc --noEmit` clean; `npm run build` passes; `next lint` clean on everything
I touched (two pre-existing warnings remain in `manage/customers` and `manage/feed`, which are
session 4's). Backend files byte-compile — **nothing was run against a database**, per the rules.

**Did not do, and why**
- **The batch section is gone but not its function.** The spec says delete the "1 2 3" batch
  section outright. Deleting it entirely would have removed the only way to say "I made four",
  and `update_product` refuses to publish a shelf piece with nothing available — so shelf
  pieces would have become unpublishable. The tally of numbered marks is gone; one quiet line
  ("3 of 4 still here" + "I made more") survives inside Reach. **Owner question below.**
- **Likes and saves are real columns reading a real field that is always 0** until session 2
  creates `ProductInteraction`. The shape does not change when they light up.
- Storefront untouched — discount, colour circles and personalization are session 2. Nothing
  new is advertised to buyers yet.
- No test was added for `effective_price` or attribute CRUD; the plan puts the test pass with
  whoever runs Docker, and §6 lists exactly what to cover.

**Next session starts at:** Session 2. `Product.effective_price()` and `ProductAttribute` are
in place for it to read; `AdminProduct.total_likes` / `total_saves` are the fields to populate.

**One question for the owner:** the batch line above — should a shelf piece keep a simple "how
many I made" control, or do you want stock handled a different way entirely? Deleting it with
nothing in its place stops shelf pieces from being published at all.

### Session 1.1 — the no-stock correction

The owner answered the batch question: **stock is not a concept this shop wants at all.** If
a shelf piece is physically gone the workshop calls the buyer — that is a phone conversation,
not a piece of software. Shelf and workshop stay as two kinds; what goes is the *counting*.

I first misread this as "everything is made-to-order" and started flipping the shelf out of
existence. The owner corrected it: shelf products are normal products, just uncounted.

**What was reverted from the misread**
- The migration `20260812_1200_no_stock_everything_made_to_order.py` (never run) is deleted.
- `Product.kind` is required again on `ProductWrite`, and the workshop coherence validator
  is back — a workshop piece without `lead_time_days` still refuses to save.
- The `ck_workshop_has_lead_time` constraint stays on the table. `is_shelf` is back.
- The AI assistant's `kind` filter is restored, and `NewPiece` has its shelf/workshop picker
  again, with a `delivery_days` field on the shelf side and `lead_time_days` on the workshop.

**What actually changes (the no-stock cleanup, kept)**
- **Checkout no longer reserves `Piece` rows.** `_take_pieces` is gone from
  `modules/orders/service.py`; every line, shelf or workshop, becomes one `OrderItem` with no
  `piece_id`. `release_stale_reservations()` still runs to release pieces that pre-cleanup
  orders are still holding — it becomes a no-op once they are done.
- **`availability()` and `variant_availability()` are deleted from the catalogue service.**
  `to_card` / `to_detail` / `to_admin` / `variants_out` no longer take an availability arg;
  `available` is always `None` in the response. The `/workshop` counts endpoint stays as-is
  (nothing on the storefront reads it).
- **Publish guard**, `update_product`: one rule per kind. Photo required either way; a
  workshop piece needs `lead_time_days` (the DB constraint covers it too); a shelf piece
  needs `delivery_days`. The old "add the pieces you made" check for shelf is gone — that
  was the stock check.
- **AI shopper `_card`** drops the `available` and `is_shelf` fields; `add_to_cart` no longer
  refuses on stock; `get_product` returns `made_of` (attribute labels) instead of per-variant
  availability. The assistant literally can no longer say "only two left".
- **Storefront:** stock signals are gone from `PieceView`, `PieceCard`, `ProductFeed`, the
  cart page and the assistant panel. No "still here", "last one", "all gone", no crossed-out
  variant swatch, no "sold out" button, no cart notice re-fetching each line. Workshop
  pieces still carry the "Ready in N days" line — that is a time promise, not stock. The
  shelf/workshop label under a card is unchanged.
- **`ProductPopup`** drops the shelf block (`Shelf` sub-component gone). Its publish blocker
  is per-kind again, matching the server: workshop → needs lead time; shelf → needs delivery
  time; no stock check either way.
- **`CartProvider`** loses `sync()` and every `Math.min(quantity, available)` clamp. The
  `available` field on `CartLine` stays in the shape (as `null`) so a cart written by an
  older tab loads without a `JSON.parse` shrug.
- **`i18n.ts`**: `allGone`, `lastOne`, `stillHere`, `weMadeThese`, `tallyMeaning`,
  `onlyMade`, `piecesMade`, `stillOnTheShelf`, `gone` are removed. Deleting the keys stops a
  future page from casually reintroducing "one left" copy.
- **JSON-LD product schema** on the piece page: `availability` is always `InStock` (every
  listed piece is buyable; the shop does not have a signal to say otherwise).

**Verified:** `npx tsc --noEmit` clean; `npm run build` passes; backend byte-compiles.
Nothing was run against a database — the M1 migration is still the only new one, and it is
written, not applied.

**Did not do**
- Retire `Piece` / `ProductVariant` / `ProductKind`. Live order lines reference them and
  history has to keep reading correctly. Written into `todo.md` for once no open order does.
- Touch the `PieceAlert` (waitlist) path — the sold-out "tell me when you make more" flow.
  It has no way to trigger any more (nothing publishes a sold-out state), so it is dead code
  rather than broken code. Added to `todo.md`.
