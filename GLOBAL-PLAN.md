# M-StyLe Console Rebuild — Global Plan

One plan for two Claude sessions. It replaces the two separate plans pasted into
`requirementMOdification.md`; those were written blind to each other and collide in
six places. Everything below is the merged, conflict-resolved version.

**Agents**

| | CLAUDEMANAGDOOR | CLAUDEORDERDOOR |
|---|---|---|
| Owns | Manage door (Products, Customers, Feed), Logs door, shared shell + kit | Order door (Orders, Custom, Messages) |
| Also owns | `models/catalog.py`, `models/security.py`, `modules/admin/customers.py`, `primitives.tsx`, `console.css`, `AdminShell.tsx` | `models/orders.py`, `models/requests.py`, `modules/orders/**`, `modules/requests/**` |

**Rules**

- Neither agent runs Docker, migrations, or the test suite. Write code, write your summary,
  stop. The owner picks one of you afterwards to build, migrate and test.
- Every shared-file edit is **additive** and **logged** in your summary block.
- **Do not restyle anything.** The current console look — the palette, the type, the spacing,
  the rail, `console.css` — is what the owner wants and it stays. New UI is composed from the
  primitives that already exist and inherits the existing look. The only CSS anyone writes is a
  new scoped rule for something that genuinely has no rule yet (a colour swatch, a red row).
  No token changes, no resets, no "while I was in there".
- **The only source of truth is `requirementMOdification.md`.** Do not go reading other plans,
  reports or design docs in this repo for direction. This file is the merge of that spec; if
  something here contradicts it, the spec wins.
- **Do nothing that was not asked for.** Every table, column, popup and endpoint below traces
  back to a line in the spec. Nothing gets added because it seemed nice.

---

## 1. What exists today (verified, not assumed)

- The admin is `frontend/src/app/admin/`: a side **Rail** with four doors — Board,
  Orders, Assistant, Manage ([AdminShell.tsx:27-32](frontend/src/app/admin/AdminShell.tsx#L27-L32)).
  Sub-sections are real routes, switched by `SectionSwitch` / `ManageSwitch`.
- Every page renders its own [`ControlStrip`](frontend/src/app/admin/ui/primitives.tsx#L131) —
  that is the "top header" the spec talks about. There is no global header component yet.
- Styling is plain CSS **scoped entirely under `.console`** in
  [console.css](frontend/src/app/admin/console.css) (981 lines). A popup portaled to
  `document.body` renders as unstyled raw text. Everything portals into `.console`.
- The kit already has `DataTable` + `useTableSort`, `Drawer`, `ConfirmProvider`/`useConfirm`,
  `Pill`, `Money`, `Age`, `SearchInput`, `Segmented`, `EmptyState`
  ([primitives.tsx](frontend/src/app/admin/ui/primitives.tsx)).
- Manage · Pieces is today a two-pane split: scannable list +
  [`PieceInspector`](frontend/src/app/admin/manage/PieceInspector.tsx) (614 lines,
  photos / words / batch / variants).
- Customers are **not** rows in `users`. They are `coalesce(customer_id, customer_phone)`
  buckets walked in Python over `orders`
  ([customers.py:38-124](backend/app/modules/admin/customers.py#L38-L124)).
- SMTP already exists and works ([notify/email.py](backend/app/modules/notify/email.py),
  `send_email`). Nobody needs to build a mailer.
- Client IP extraction already exists ([limits.py:35-45](backend/app/core/limits.py#L35-L45)).
- Latest migration is `20260811_1900_archive_contact_messages` (revision `c3f1a8b52d64`).

---

## 2. Unified decisions — read this section twice

These are the points where the two blind plans disagreed, overlapped, or both missed
something. **These decisions are binding on both agents.**

### D1 — One header primitive, built once, consumed twice
Both plans independently rebuild `ControlStrip`. That would be two conflicting rewrites of a
shared file. Instead: **CLAUDEMANAGDOOR adds a new `ConsoleHeader` primitive** to
`primitives.tsx`, additively (`ControlStrip` stays, untouched, until every page is migrated).
`CLAUDEORDERDOOR` codes against this exact signature without waiting:

```tsx
export function ConsoleHeader({ filters, search, pages }: {
  filters?: ReactNode;                       // zone 1 — omit entirely to hide (Messages)
  search?: { value: string; onChange: (v: string) => void; placeholder?: string };
  pages: { href: string; label: string; active?: boolean }[];  // zone 3
  trailing?: ReactNode;                      // e.g. Manage's "Add" button
}): JSX.Element
```

Three zones, left → right: filters · search · quick-page nav. No page titles. **No
"N need attention" pills** anywhere — the owner said so explicitly.

### D2 — The rail keeps five doors, Logs is the fifth
Board · Orders · Assistant · Manage · **Logs**. Note the rail already folds utilities behind
"More" on phones; a fifth door makes six phone targets. MANAGE adjusts the phone breakpoint
rules in `console.css` when adding it. This is the only structural change to the shell.

### D3 — Attributes replace variants as the *customer's choice*, and orders must record them
This is the biggest thing both plans got half-right. The manage spec says: delete the variants
section, add flexible **measure / colour / material**, and colours "show up with a circle in
the user interface". The order spec says the order modal must show "selected product
attributes (Size, Color, Variant specifications)".

So attributes are not decoration — **they are what the buyer picks**, which means the order
line must store the selection. Decision:

- `ProductAttribute` is the new source of truth for size/colour/material (MANAGE builds it).
- `OrderItem` gains `selection: JSON` — a frozen snapshot list of
  `{group, name, value, unit, hex}` captured at checkout (ORDER builds it). A **snapshot**,
  not FKs, so relabelling an attribute next month does not rewrite last month's order.
- `ProductVariant` **stays in the database, disappears from the admin UI**. Existing orders
  reference it; dropping it is a todo, not this pass. Where an old order has a variant and no
  selection, the modal shows the variant option string.

### D4 — Delivery time: one field, one owner
MANAGE's plan adds `Product.delivery_days`; ORDER's plan adds `Order.promised_for` derived
from `lead_time_days`. Both are needed and they chain:

- `Product.delivery_days` (nullable int) — set/edited in the Products table and Open popup,
  applies to **shelf and workshop** pieces alike. MANAGE owns it.
- `Order.promised_for` (nullable date) — the deadline the countdown counts to, admin-editable,
  defaulted at checkout to `order date + max(delivery_days or lead_time_days over the items)`.
  ORDER owns it, and reads MANAGE's field.
- `lead_time_days` keeps its existing meaning for workshop pricing copy and the
  `ck_workshop_has_lead_time` constraint. Do not remove it.

### D5 — Guest identity: `Order.visitor_id` is the missing link
MANAGE's plan puts likes/saves on the **visitor fingerprint**. Customers are bucketed by
**phone**. Those two never join, so "total likes / total saves per customer" and the whole
customer-behaviour Analytics popup would be **empty for every guest** — and guests are most of
this shop. `customers.py:84-86` already admits it can't attribute dwell to guests.

Fix, and it fixes three features at once: **ORDER adds `visitor_id: String(80)` to `Order`**,
written at checkout from the fingerprint the storefront already sends. MANAGE's customer
aggregation then collects the set of `visitor_id`s per bucket and joins likes, saves and
behaviour signals through it — for guests *and* accounts.

### D6 — Delete means archive, everywhere, in both doors
No hard deletes anywhere in this pass. Orders and custom requests get `hidden_at`; products
use the existing `ProductStatus.archived`. Every Delete action = `useConfirm()` → archive →
recoverable from a "Hidden/Archived" filter in the same table. One vocabulary across both doors.

### D7 — Discount is one model, shown in both doors and the storefront
`discount_kind` (`percent | fixed`) · `discount_value` · `discount_active`. Per-product,
off by default, manually disable-able — exactly as the owner described ("that doesn't apply on
all products, and we can disable it manually"). `effective_price()` lives on the model so the
admin table, the storefront, the cart and the order total all read the same number.
**MANAGE builds it; ORDER uses `effective_price()` for order lines — never recomputes it.**

### D8 — Customer type is derived in one place
Guest vs Verified = `has_account`. `customers.py` already derives it. ORDER's `OrderResponse`
exposes the same flag from `customer_id is not None`. Same words in both UIs: **Guest** /
**Verified**.

### D9 — Migration chain is pre-assigned, so the two of you cannot fork it
Alembic is a linear chain. Use exactly these revisions and parents, in this order:

| # | File | revision | down_revision | Owner |
|---|---|---|---|---|
| M1 | `20260812_1000_product_attributes_discount_interactions.py` | `d41a7c9b6e02` | `c3f1a8b52d64` | MANAGE |
| M2 | `20260812_1030_security_events_and_blocklist.py` | `e58b2d0f7a13` | `d41a7c9b6e02` | MANAGE |
| M3 | `20260812_1100_order_promise_hidden_visitor_selection.py` | `f6923ea18b24` | `e58b2d0f7a13` | ORDER |
| M4 | `20260812_1130_custom_request_hidden.py` | `a7034fb29c35` | `f6923ea18b24` | ORDER |

Nobody runs `alembic revision --autogenerate` — hand-write the file, matching the prose-doc
style of the existing ones. Both `upgrade()` and `downgrade()`.

### D10 — Personalization: build the plumbing, don't advertise it
The order spec wants the modal to show "exact customer input whenever the Personalized option
flag is selected". Repo memory says personalize-option is deferred and must not be sold as
live. Resolution: `Product.personalizable: bool = False` (MANAGE, toggle in the Open popup) and
`OrderItem.personalization: Text | None` (ORDER, rendered in the modal **only when present**).
No storefront input field this pass, so nothing is advertised. Wiring the storefront input is a
todo. See open question Q3.

### D11 — Category management moves into the Add popup
The manage quick-nav is `[Products, Customers, Feed]` — categories is not a page any more.
MANAGE extracts the CRUD from `manage/categories/page.tsx` into a `<CategoryManager/>`
component used inside the Add popup, and leaves the route as a redirect to `/admin/manage`
rather than deleting a deep-linkable URL out from under a bookmark.

### D12 — "Custom" is a label change, not a route change
`SectionSwitch` shows **Custom**; the route stays `/admin/orders/commissions`. Renaming the
folder is churn across imports, tests and bookmarks for zero user-visible gain.

### D13 — Soft-delete never leaks to the storefront
`GET /orders/track/{token}` and `POST /orders/find` must **not** filter on `hidden_at`. Hiding
an order is an admin view preference; the customer who is waiting for their package still
tracks it.

### D14 — Feed stat-model and the Data door are `todo.md` only
Both are genuinely interesting and neither is a table this week. Written down, not built.

### D15 — Shared-file protocol
`primitives.tsx`, `console.css`, `AdminShell.tsx` — **MANAGE writes, ORDER requests.** If ORDER
needs a primitive, ORDER writes it locally inside `admin/orders/` and notes it in the summary
for later promotion. The one exception, pre-agreed here so ORDER is not blocked: ORDER may
append the single rule `.console-row-cancelled { color: var(--danger); }` to `console.css`,
at the end of the file, and nothing else.
`types.ts` and `api.ts` are append-only for both: MANAGE appends at the **top** of the
catalog/customer sections, ORDER appends at the **bottom** of the file. Never reorder, never
reformat, never touch a line you did not add.

---

## 3. Phasing

**Phase 0 — MANAGE, first, small.** `ConsoleHeader` + `DateRangeFilter` + `Swatch` +
`WideModal` primitives, the Logs door in the rail, the new `console.css` scoped rules. Land it
before the Products rewrite so ORDER's import lands on real code. ORDER does not wait — the
D1 signature is the contract.

**Phase 1 — backend, both, in the D9 migration order.**

**Phase 2 — door frontends, fully parallel.**

**Phase 3 — storefront ripples.** MANAGE: hearts/saves, discount display, colour circles,
block popup. ORDER: "arrives by / X days left" on the tracking page.

**Phase 4 — `todo.md` + summary blocks.**

---

## 4. Backend — the whole data model in one table

### CLAUDEMANAGDOOR — `models/catalog.py`, new `models/security.py` (migrations M1, M2)

| Change | Detail |
|---|---|
| `Product.discount_kind` | `Enum(percent, fixed)`, nullable |
| `Product.discount_value` | `Numeric(10,2)`, nullable |
| `Product.discount_active` | `Boolean`, default `False` |
| `Product.effective_price()` | method — returns discounted price or `price`; ignores an inactive/null discount |
| `Product.delivery_days` | `Integer`, nullable — D4 |
| `Product.personalizable` | `Boolean`, default `False` — D10 |
| **`ProductAttribute`** (new) | `id, product_id FK cascade, group Enum(measure|color|material), name String(60) nullable, value String(80), unit String(16) nullable, hex String(7) nullable, display_order Int`. `Product.attributes` relationship, `delete-orphan`. `name` null = a plain value like `M`; `name` set = a typed one like `Height: 180 cm` |
| **`ProductInteraction`** (new) | `id, product_id FK cascade, kind Enum(like|save), visitor_id String(80), user_id FK nullable, created_at`. Unique `(product_id, visitor_id, kind)` — makes the toggle idempotent |
| **`SecurityEvent`** (new, `models/security.py`) | `id, created_at, level Enum(info|warn|danger), kind String(40), message Text, ip String(45) nullable, visitor_id nullable, user_id FK nullable, meta JSON`. Index on `(created_at)` and `(level, created_at)` |
| **`Blocklist`** (new) | `id, created_at, reason Text, ip nullable, visitor_id nullable, active Boolean default True`. At least one of ip/visitor_id non-null (CheckConstraint) |
| `ProductVariant` | **untouched** — D3 |

### CLAUDEORDERDOOR — `models/orders.py`, `models/requests.py` (migrations M3, M4)

| Change | Detail |
|---|---|
| `Order.promised_for` | `Date`, nullable — D4 |
| `Order.hidden_at` | `DateTime(tz)`, nullable — D6 |
| `Order.visitor_id` | `String(80)`, nullable, indexed — D5, the join key for guest behaviour |
| `OrderItem.selection` | `JSON`, nullable — frozen attribute snapshot, D3 |
| `OrderItem.personalization` | `Text`, nullable — D10 |
| `CustomRequest.hidden_at` | `DateTime(tz)`, nullable |

### API surface

**MANAGE**
- `GET /admin/products` — extend with `q`, `category_id`, date range, `status`; response gains
  `updated_at`, `delivery_days`, discount fields, `attributes[]`, `total_likes`, `total_saves`,
  `category_name`, `subcategory_name`.
- `POST|PATCH|DELETE /admin/products/{id}/attributes[/{attr_id}]`
- `GET /admin/products/{id}/analytics` — views, clicks, add-to-cart, likes/saves over time,
  from the existing `signals` aggregation in `modules/admin/analytics.py`.
- `POST /products/{id}/like` · `POST /products/{id}/save` — public, toggle, keyed on the
  visitor fingerprint header the feed already sends; `GET /products/{id}/interactions` returns
  this visitor's current state + totals.
- `GET /admin/customers` — extend with `total_saves`, `total_likes`, `total_products`,
  `created_at`, `city`, `type`.
- `GET /admin/customers/{id}/analytics` — the behaviour view, joined through D5.
- `GET /admin/security/logs?level=&since=` · `GET /admin/security/events/{id}` ·
  `POST /admin/security/block` · `DELETE /admin/security/block/{id}`
- **Middleware** in `main.py`: an active `Blocklist` match on ip **or** visitor → `403` with a
  stable machine-readable code (`blocked`) the storefront turns into the block popup.
- **Alerting**: a `danger` event calls the existing `send_email` to
  `yassinsinif4@gmail.com` **and** `Yassine.Sinif@emsi-edu.ma`. Debounce per `(kind, ip)` —
  a flood must not become an email flood. Reuse `client_ip()` from `core/limits.py`; hook the
  rate-limiter's 429 path so a burst is recorded.

**ORDER**
- `GET /admin/orders` — add `city`, date range, and `hidden` (defaults to excluding hidden).
- `GET /admin/orders/cities` — distinct cities across non-hidden active orders (feeds the
  dynamic City filter).
- `POST /admin/orders/{reference}/promise` — set/modify `promised_for`.
- `POST /admin/orders/{reference}/hide` · `/unhide`
- `OrderResponse` gains `promised_for`, `has_account`, `hidden`, `visitor_id` is **not**
  exposed. `OrderItemResponse` gains `category`, `subcategory`, `selection`, `personalization`.
- `GET /admin/requests` — add `category_id`, date range, `hidden`. `RequestOut` gains
  `category_name`, `hidden`. `POST /admin/requests/{id}/hide` · `/unhide`.
- Status change keeps the existing auto-email (`notify/service.py`) and the one-tap `wa.me`
  link. Optionally add `promised_for` to the email copy. **A real WhatsApp Business API
  auto-send is a todo, not this pass.**

---

## 5. Frontend — Manage door (CLAUDEMANAGDOOR)

### Header
`ConsoleHeader`: **Date range (from → to)** · **Add** button · **Search** ·
`[Products, Customers, Feed]`. Nothing else.

### Products — rewrite `manage/page.tsx`
Kill the `console-split`. One `DataTable`, every header sortable via `useTableSort`:

`Photo` · `Created` *(with the modified date beneath it, small and green, only when it differs)*
· `Name` · `Category` · `Sub-category` · `Price` *(struck original + discounted when active)* ·
`Delivery time` · `Saves` · `Likes` · `Actions`

Actions, each opening a popup portaled into `.console`:
- **Open** — a wide centred modal, Aptiv-shaped:
  - *Photos* — add / delete / per-image alt text. Lift the working logic from
    [PieceInspector.tsx:271-375](frontend/src/app/admin/manage/PieceInspector.tsx#L271-L375).
  - *Words* — a **language dropdown** (EN/AR) that reveals name + description for that
    language. The model stays bilingual columns; the dropdown is a UI affordance, not a schema
    change.
  - *Commerce* — price, discount (kind · value · on/off), delivery time, personalizable toggle.
  - *Attributes* — the new pill editor, Aptiv `PartsEditor`-shaped: add a measure (plain `M`,
    or typed `Height 180 cm`), a colour (label + hex → circular swatch), a material. One or
    many, each removable, all optional. This is the flexible part the owner asked for twice.
  - *Reach* — total likes / total saves, read-only.
  - **Deleted from the inspector: the batch (1 · 2 · 3) section and the variants section.**
- **Analytics** — per-product behaviour popup.
- **Delete** — confirm → archive (D6).

**Add popup** — Category (dropdown + add / modify / delete, with modify + delete emphasised
once a category is selected) → Sub-category (identical) → Product. Add/Modify Product opens the
same Open popup, so there is exactly one product form in the codebase.

### Customers — rewrite `manage/customers/page.tsx`
`DataTable`: `Created` · `Name` · `Phone` · `Email` · `Type (Verified/Guest)` · `Total spent` ·
`Total products` · `Saves` · `Likes` · `Actions`.
- **Open** → centred popup (not a side panel): full profile — address, city, email, phone,
  type, order history, totals.
- **Analytics** → behaviour popup: visits, funnel, dwell, liked/saved pieces — works for guests
  thanks to D5.
- **Block** → confirm → account `is_active=false` and/or a `Blocklist` entry for their device.

### Feed
Untouched. The auto-rotating cohort model goes to `todo.md`.

### Logs — new `admin/logs/` (deliberately plain)
`DataTable`: `Time` · `Level` · `Kind` · `Message` · `IP`. **Danger rows in red.** Row → event
detail with the device fingerprint and account, and a **Block device** action (confirm → popup).
No cards, no charts, no chrome — the owner asked for simple.

---

## 6. Frontend — Order door (CLAUDEORDERDOOR)

### Header
`ConsoleHeader` on all three sub-pages. Filters are contextual; **Messages passes no `filters`
prop at all**, which hides zone 1. Quick-nav `[Orders, Custom, Messages]`.

### Orders — `orders/page.tsx` + `OrderDrawer.tsx`
Columns: `Date` · `Ref` · `Customer` · `City` · `Product` *(all items consolidated in one cell,
one row per order)* · `Qty` *(summed)* · `Total` · `Delivery countdown` · `Status` ·
`Actions (Open, Delete)`. All headers sortable.

- **Cancelled → the whole row's text turns red** (`.console-row-cancelled`, D15).
- Filters: date range · status (incl. Cancelled) · dynamic City from `/admin/orders/cities` ·
  Hidden/Archived toggle.
- **Invoice** — printable view (order, items, totals, customer) via a scoped `@media print`
  block + `window.print()`, reachable from the row and the modal.
- **Modal** — customer profile incl. Guest/Verified; per item Category · Sub-category ·
  **selected attributes** (D3); personalization block *only if present* (D10); editable
  `promised_for` with live countdown; `SetStatus` (already auto-emails) + the one-tap WhatsApp
  link.

### Custom — `orders/commissions/page.tsx`
Columns: `Date` · `Ref` · `Customer` · `City` · `Category` · `Status` · `Actions (Open, Delete)`.
Filters: custom category · status · date range. Modal in the Aptiv intervention shape — pill row,
key/value detail list (customer desires, email / phone / WhatsApp), reference-photo grid, the
existing `QuoteForm` for price + "Ready in X days", and the WhatsApp/call triggers.

### Messages
Unchanged, per spec. Header only.

---

## 7. Storefront ripples

**MANAGE** — `frontend/src/app/[lang]/`
- Discount on `piece/[slug]/PieceView.tsx` and product cards: struck original + reduced price +
  badge, **only when `discount_active`**.
- Heart (like) and Save buttons, optimistic toggle, posting with the existing fingerprint.
- Attributes rendered: colours as circles, measures and materials as labelled chips.
- The block popup on a `403 blocked`: *"You are blocked for security reasons — contact support
  on 0623842535, or email mostyle.service@gmail.com."*

**ORDER**
- "Arrives by · X days left" from `promised_for` on the order-tracking page.
- Checkout sends the visitor fingerprint so `Order.visitor_id` is populated (D5).

---

## 8. `todo.md` (repo root — MANAGE creates it, ORDER appends)

1. **Feed auto-rotating statistical cohorts** — 5 behavioural stats, 20% buckets, rotating
   weekly. Cold-start first week. Weibull/ML forecast of next-7-day visitors. **Ads-period
   declaration** so the model separates ads traffic from organic and stops hallucinating when
   the owner buys reach.
2. **Data door** — incremental, query-based daily backup. One evolving backup that new queries
   are pushed into, not sixty full dumps.
3. **Drop `ProductVariant`** once no live order references it (D3).
4. **Storefront personalization input** (D10) — plumbing exists, UI doesn't. Not live, do not
   advertise.
5. **Real WhatsApp Business API auto-send** — today it is a click-to-chat link.
6. **Dashboard density** — the owner finds the Board dense with low-value numbers. Not this pass.

---

## 9. Handoff protocol

Add these two blocks to the end of `requirementMOdification.md` — they are referenced by both
plans but do not actually exist in the file yet:

```
messages of CLAUDEMANAGDOOR{{{ }}}
messages of CLAUDEORDERDOOR{{{ }}}
```

Each summary, in this order: **what I did** · **what I did not do** (and why) · **every shared
file I touched, with the exact symbols added** · **anything the other door must rebase onto** ·
**what I could not verify** because neither of us ran Docker.

---

## 10. Verification — for whichever agent the owner picks

1. `alembic upgrade head` applies M1→M4 cleanly; `downgrade` back to `c3f1a8b52d64` also works.
2. `backend/tests/` still green. New focused tests: attribute CRUD; like/save toggle
   idempotency against the unique constraint; `effective_price()` with percent, fixed, inactive
   and null; blocklist 403; customer aggregation returns non-zero likes/saves **for a guest**
   (the D5 path — this is the one most likely to be silently broken); order hide/unhide; the
   city filter; `promised_for` default at checkout.
3. `npm run build` in `frontend/` — the prod build enforces TypeScript, and that is where
   `types.ts` merge damage between the two agents will surface first.
4. Manual admin pass: every Products column sorts; the Open popup saves photos, words,
   attributes and discount; the Add popup drives category → sub-category → product; Customers
   Open/Analytics/Block work; a cancelled order's row is red; delete → Hidden → restore; an
   invoice prints; a danger log row is red and Block-device works.
5. Manual storefront pass: discount shows only when active; heart/save survive a reload with the
   same fingerprint; a blocked device sees the support popup.
6. Use the `browser-automation` skill on `/admin/manage` and one product page to confirm no
   `.console` portal regressions — a popup rendering as raw unstyled text is the signature
   failure of this codebase.

---

## 11. Open questions for the owner

These change the work materially. Everything else in this plan proceeds without an answer.

- **Q1 — Attributes and price.** Can a colour or size change the price (a large costs more than
  a medium), or is the price always per-product? This plan assumes **per-product**; making
  attributes price-bearing is a different schema.
- **Q2 — Attributes and stock.** For a shelf piece with four physical `pieces` rows, does
  picking "red / M" need to check that a red M actually exists? This plan assumes **no** —
  attributes are chosen freely and stock stays a count of pieces. If yes, that is a real
  inventory feature and needs its own pass.
- **Q3 — Personalization.** D10 builds the plumbing and shows it in the admin, but adds no
  storefront input, so the feature is invisible to buyers. Confirm that is what you want for
  now, or say the word and it ships end-to-end.
- **Q4 — Block scope.** Blocking a device blocks a browser fingerprint, which the person clears
  by opening a private window. Do you also want the IP blocked, accepting that this can catch a
  whole household or café on a shared address?
- **Q5 — Logs volume.** `SecurityEvent` grows forever. Should it self-prune (say, keep 90 days
  of `info`, forever for `danger`), or do you want to keep everything?
