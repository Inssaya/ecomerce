heyMR CCLAUDE agent : 
however inside this file 2 AI CLAUDE WLL COMMINICATE I WLL NAME U INSIDE UR SEESSION WITH CLAUDEMANAGEDOOR
AND CLAUDEORDERDOOR

why is this , simple a good communication , fast work,, both of u wll not test or do docker thing only code then just one of u wll push work into docker , however cuurent style is good tnx to claude in last session he did a good work ,  ur mission is just modify  , ,,, when someone finish he need to write small summary of what he did , then what he not did  , then i wll choose one of u to contunu working on docker and some test ,, however this spesification need ur review , i want to make sure that u indesrtaand my idea very very very goood ,, so ask me questions ifsomething in ambios ,, and told me if u dont inderstand somthing 


HOWEVER THIS IS the spesification requirment of order door
""""System Architecture & UI/UX Specification Report
1. Top Header & Navigation Layout
The main header layout follows a strict three-section horizontal arrangement from left to right:
 * Dynamic Page Filters: Contextual filter buttons that dynamically update based on the currently selected page. Clicking any filter button reveals its corresponding dropdown menu (e.g., Date Range, Status, City).
 * Search Bar: Central global search input querying Customer Name, Order Reference (Ref), and Phone Number.
 * Quick-Access Page Navigation: Three dedicated primary page navigation buttons: Orders, Custom (formerly "Commission"), and Messages.
2. Orders Module
Table Architecture
 * Columns: Date | Reference (Ref) | Customer | City | Product | Total Quantity | Total Amount | Delivery Countdown | Status | Actions (Open, Delete)
 * Multi-Item Display: Orders with multiple products or categories list all items consolidated on the same row.
 * Row Status Styling: If an order is marked as Cancelled, the text font color for the entire row automatically changes to Red.
Orders Page Dynamic Filters (Header Section 1)
 * Date Range Filter: Dropdown menu with an integrated date-picker.
 * Status Filter: Dropdown containing all order statuses, including a dedicated Cancelled state.
 * Dynamic City Filter: Dropdown dynamically populated strictly with cities present in active orders.
 * Interactive Column Sorting: Clicking any column header (Date, Category, Product, etc.) toggles sorting between ascending and descending order.
 * Invoice Generation: Dedicated action to print order invoices directly from the interface.
Order Details Modal (Open Action)
 * Customer Profile: Name, Email, Phone Number, Full Delivery Address, City, and Customer Type (Guest vs. Verified Customer).
 * Product Specifications: Complete breakdown of Category, Sub-category, and selected product attributes (Size, Color, Variant specifications).
 * Customization Flags: Displays exact customer input whenever the Personalized option flag is selected.
 * Delivery Management: Displays the active delivery countdown timer (e.g., 2 Days Left, 3 Days Left).
 * Status Management & Notifications: Integrated SetStatus control. Updating a status automatically dispatches a consolidated WhatsApp and Email notification containing order details, status updates, and tracking information.
3. Custom Module (Formerly "Commission")
Table Architecture
 * Columns: Date | Reference (Ref) | Customer Name | City | Category | Status | Actions (Open, Delete)
Custom Page Dynamic Filters (Header Section 1)
 * Filter options update dynamically to display controls relevant specifically to custom request workflows (e.g., Custom Category, Status, Date Range).
Custom Request Modal (Open Action)
 * Intervention UI Pattern: Modal structure styled after the Aptiv project log/intervention modal interface.
 * Contact & Requirement Inputs: Full display of Customer Desires, attached specification files, and required contact channels (Email, Phone Number, WhatsApp).
 * Cost & Delivery Estimation: Admin inputs for custom pricing and estimated time to delivery (e.g., Ready in X Days).
 * Communication Triggers: Integrated controls to prompt WhatsApp messages/calls, with automated status updates dispatched via Email and WhatsApp.
4. Messages Module
 * Retained in its current design and functionality without modifications (Header section 1 updates filters accordingly or hides them if not applicable)."""""

and this is spesification requermentof manage door

"""""""Okok we are inside manage door

First thing i see is the top header that have a shit filter then searh bar then quiqbutton  pages redirect [pieces , category,feed ] abutton for add piece

Okok this top header -> delet it 

What we wll have

Agoodfulter instead of the shit filter then asearh bar  then the quiq redirevt pages 

U wll think they are the same but they are not


However 


Lets talk on piece page

Y wll change its name to products

Currentky we have two sides 
Left for product and right for ....

U wll delet this also 
Why?
A new architect 


U do a full table of product like  the one in order  
However 

We start wirh photo of product 
Then date of crearion ( a date  of modificarion in green with small size under 
Just in case of modification) 
Then some usful information 
Like name category subcategory  price  delevryTime ... and actions like
Open delet analytic
For each one after click a popshow up 

Open popup :
It  have photos with old action like add and alt text for each  and delet 

We can easiyly see rhe title rhe categkryvthe subcategoryv
And justcasntheb right part its have the words also 
But first u select langugae from dropdown 
Click to button and thatdropdown appear
U select language and add 
Name
Description 
Price
Reduction(its good) we should add it alsl in costumer interace  howveer that doesent apply on all produxt onlt the rhing we want  and we can desable it manuly 

The total save and total likes
U wll ask what its that ?
Inwll say
Yes as pinterst
User can like a product add a heart or  save it for buy later 

I see in current interface 
The batch 1 2 3 
Delet this whole section 

We dont need it wtf

U sould add this section 


As u know we have alot of category and they are flexible 

So what
Think 
Some categkey have taile , some have colors some have material 

However one liece can share all of thus or just one

So selecting this is flexibke  in each product u can add measur(la taile)
Its flexible u can select from a droldown list 
Somthinglike 
High u wll add jsut value
Or width
Or xl L S M 

Or seleft all thks in same time
Some of them have type->value and some are normal like M L .... 

Smae thing for colors
U can add one or mant

Colors show uo with a cercle in user interface

U can also add material like wood ... and what 
Its flexible also 
Look into piecepart whe. U want to add an intervention inside aptic project 


I see variants sextion also in this,  delet it 


I forget i table we should have also total save and total likes



Okok 
Letsgo on top headerr

The filter should have thos

Date sith dropdown of cusrom  range  from to 
Then infront of it 
A button called add

What we wll add
Hmmm 

After clicked apopupshow up 


Have 
Category with dropdown flesh and action icon like modify and delet and add

Modify and delet appear get اغمق after clicking on acategory in drop down
Ok تحتها 
Sub categkry with same thing

Then 
Peoduct


When u press add prodxut or modify u get same popupe  that show up when u click open iside the tablo 

Ok what after lets close the popup 
What afteer the add button 
Ok lets see
We nees a searsh bar and  the quiq pages button 

[Product , costumers, feed ] only
Please notice 

Dknt do title like show find 7 need attention ......no need for them 
Do as i said

Letsgo on costumer page

W eshould have  table 

With

Date od crearing name  phone numver email typeofaUser(auth or guest) totalspent total prodcut total save total like and actions like 
Open (its show apopup 
Not legt part  popuo like the one in aptiv

However 

I said open , analystic for behavor

Open wll give us all information about that costumer

Adress email city ..... .. . .. . . . .. . . .. . . . .. )

Maybe i forget but kn product we should have timeof delevry we add it in table and when we open so we can set it or modify it

Okok 
Letsgo onfeed
This  page is goood i like it

But one thing  
We should have isndie  some statical methods that set that automaticly depend on the behavor of user 
It change automaticly 7 dat by 7 day

Depend on user behavor

How 
Unwll add some statical model like 5 
How to know the champion this is not predictive its analytic behavor

For exemple ychoose 5 stat 
Then 20% for the first -> user get stat one
Second 20% get secknd and etc
But probleme we dont know how mush we wll get user
That why first week is خامل
Then a predictuve model with weibul or somthing like this or ml model

Predict next  7days users

Its very depend 

Look if admin add ads rhat wll make huge diff and make the  model يهلوس

So what solotion 

Model know if we add ads or not
We wllvdeclare it after each ads that we add it

And he wll see the behavor also 

So 

Yes other page that study behavkr of user in ads
And non ads perios 

We should enter somethinglike period of ads .....

We can add this in dashboard
Acculy dashboard is prettt good but its verydens with nonusefull informatikn 

However dontworry about that 
We are not in dashboard we are in this feed page

And ths wll be just a todo coment inside a todo.md  so u wll remeber it  

And that all 



Ur mission isnjust the manage 

However i sugget to add
Data inthis door


Data have 
DayByday backup 
But not just anybackup 

We dont want 60file lf dayli backup 

Backup its modifyed automaticly and its  on file backup 

We just push new informatuon

So how

Their is amethod i already learn it from claude

We push querys that is mush better

Okok 

That all in 4 door manage dooor

 Dl only this

Ifor todo add also this

We need  5 door for livelogs  with alerts for اشياء غريبة like
[  ] 40000reqyest from same phone same usrt insame seconf 🥲  
Ohh i forget for costumer we have this action also 
Block  


However thenlage of log
It should be just simple no need for extra desing

Hkwver all  loogs. Of serveur appear in this  pages

With a notifcation system 
How i dont wnat abug title notifcation 

 How 
When somthing is not good happend 

Quiq email send to yassinsinif4@gmail.com 
And Yassine.Sinif@emsi-edu.ma

With what hapend

Also thos logs الدين قد يشكلون خطر من هاكرز  shkuld be on red colors

What we wll have in this page
We cam click to logs and see the fingerprint of userdevice

Or acc
However 
We can quiqu aciton block his devise to enter to our website again 
And a popup showup to him 

U are bloked for security reason contact suuport on this number  
0623842535
Or leave email under
mostyle.service@gmail.com""""""



this iS WHAT EACH AIAGENT PLAN  they are look like caos , u wll see the requiremnt spesification and look into thos 2 blind plans and write one unique global big plan  

# CLAUDEMANAGDOOR — Manage Door Rebuild Plan

## Context

M-StyLe's admin ("console") was recently rewritten as an Aptiv-styled four-door
panel (Board / Orders / Assistant / Manage), currently **uncommitted** in the
working tree. The owner (single vendor) wants the **Manage door** re-architected:
the current two-sided split (scannable list + `PieceInspector`) is replaced by
**full data-tables modeled on the Orders table**, the "piece" vocabulary becomes
**Products**, and several genuinely-new capabilities are added that no backend
model supports yet — flexible product attributes (size/colour/material), a
per-product **discount**, Pinterest-style **likes/saves**, and a new **Logs**
security door.

Two Claude sessions work this file in parallel: **CLAUDEMANAGDOOR (me)** owns the
Manage door + shared shell/kit; **CLAUDEORDERDOOR** owns Orders/Custom/Messages.
Neither runs Docker or tests — one of us is chosen to do that afterward. When I
finish I write a summary into the `messages of CLAUDEMANAGDOOR{{{ }}}` block of
`requirementMOdification.md`.

**Confirmed decisions:** Build Products + Customers **fully**, Logs **basic**;
Feed stat-model + Data door = **todo.md only**. Add **real backend models**.
Wire the **customer-facing** side too (hearts/save + discount display). Likes/saves
keyed on the **visitor fingerprint** (guests + accounts), like the feed's signals.
Discount = **owner picks** percentage OR fixed sale price. I **own the shared
shell + kit** (AdminShell, primitives.tsx, console.css) and document every shared
change in the message block for CLAUDEORDERDOOR to rebase onto.

---

## Scope boundary (what I do NOT touch)

- `admin/orders/**` (page, `OrderDrawer`, `SectionSwitch`, commissions, messages) — CLAUDEORDERDOOR.
- The Orders/Custom/Messages backend behaviour, WhatsApp/Email order notifications.
- Cancelled-row-red styling on the Orders table (order-door requirement line 19).
- Shared files I *must* edit (AdminShell rail, `primitives.tsx`, `console.css`, backend
  `catalog`/`admin` modules) — I edit them, keep changes additive where possible, and
  log each one precisely in the message block.

---

## Backend changes (`backend/app/`)

New/changed models in `models/catalog.py`, `models/user.py`, plus a new
`models/security.py`, each with an Alembic migration (creation only — I do not run it).

### 1. Product discount — `Product` (catalog.py:114)
Add nullable fields + toggle so it applies only to chosen pieces and can be disabled:
- `discount_kind` (enum `percent | fixed`, nullable), `discount_value` (Numeric, nullable),
  `discount_active` (bool default False).
- Helper `effective_price()` / `discount_amount()` on the model.
- Surface in `ProductWrite`/`ProductPatch` (`catalog/schemas.py`) and product read schemas
  used by both admin and storefront.

### 2. Flexible attributes — new `ProductAttribute` (catalog.py)
One generic table, Aptiv-`PartsEditor` shaped (pill list + add-row), replacing the
deleted variants concept for size/colour/material:
- `id, product_id (FK), group (enum: measure|color|material), name (nullable — the
  type, e.g. "Height"; null for plain like "M"), value (e.g. "180" / "M" / "Wood"),
  unit (nullable, e.g. "cm"), hex (nullable — colours only), display_order`.
- Relationship `Product.attributes` (cascade delete-orphan).
- CRUD under the catalog admin router: `POST/PATCH/DELETE /admin/products/{id}/attributes`.
- **Deprecate `ProductVariant`** from the admin UI (section removed) but keep the model +
  data intact (orders reference variants) — flag for a later migration rather than dropping now.

### 3. Likes & saves — new `ProductInteraction` (catalog.py)
Mirrors the feed's `Signal` identity model (visitor fingerprint + optional account):
- `id, product_id (FK), kind (enum: like|save), visitor_id (String(80)), user_id (nullable FK),
  created_at`. Unique `(product_id, visitor_id, kind)`.
- Public endpoints: `POST /products/{id}/like`, `/save` (toggle), keyed by the same
  `visitor_id` header/body the feed already sends; `GET` returns the visitor's current state.
- Aggregates: `total_likes`, `total_saves` per product (counts) added to product read schemas
  and to the admin product list; per-customer counts joined into the customers aggregation.

### 4. Delivery time on products
Generalize so shelf pieces can also show/set a delivery estimate (today only workshop has
`lead_time_days`). Add `delivery_days` (nullable Integer) usable by both kinds, surfaced in
the table + Open popup; keep `lead_time_days` semantics for workshop pricing copy.

### 5. Security / logs / device-block — new `models/security.py` + `modules/security/`
Basic but real (per "Logs basic"):
- `SecurityEvent`: `id, created_at, level (info|warn|danger), kind, message, ip, visitor_id,
  user_id (nullable), meta (JSON)`.
- `Blocklist`: `id, created_at, reason, ip (nullable), visitor_id (nullable), active`.
- A logging sink (`modules/security/service.py`) the app writes notable events to
  (rate-limit trips from `core/limits.py`, auth failures, floods). Reuse the existing
  `X-Forwarded-For` client-IP extraction in `core/limits.py:38-45`.
- Enforcement middleware in `main.py`: if request IP/visitor is on an **active** `Blocklist`,
  return a 403 the storefront renders as the block popup.
- Email alert hook: on a `danger` event, send to `yassinsinif4@gmail.com` **and**
  `Yassine.Sinif@emsi-edu.ma`. **Reuse existing mail infra if present**; if none exists,
  implement a minimal SMTP sender gated behind env config and note it in the handoff.
- Admin endpoints: `GET /admin/security/logs` (filter by level), `POST /admin/security/block`,
  `DELETE /admin/security/block/{id}`, `GET /admin/security/event/{id}` (fingerprint drill-in).

### 6. Customer aggregation (`modules/admin/customers.py`)
Extend the existing on-the-fly aggregation (customers.py:38-124) to also return
`total_saves`, `total_likes` (joined via `ProductInteraction`), `total_products`, and the
`auth|guest` type it already derives from `has_account`. Block stays `is_active` for accounts;
device/IP block routes through the new `Blocklist`.

---

## Frontend — Manage door (`frontend/src/app/admin/`)

Reuse the existing kit in `ui/primitives.tsx`: `DataTable` + `useTableSort` (click-header
asc/desc), `ControlStrip`, `Drawer`/modal, `ConfirmProvider`, `Pill`, `Money`, `Age`,
`SearchInput`, `Segmented`. All popups **must portal into `.console`**, never `document.body`
(console.css is fully scoped — a body portal renders as raw text; see primitives.tsx:569-573).

### Header (replaces the current `ControlStrip` on manage pages)
Rebuild the manage `ControlStrip` to: **Date-range filter** (from→to picker) · **Add** button
(opens the category/subcategory/product manager popup) · **Search bar** · quick-page switch
`[Products, Customers, Feed]`. No "N need attention" pill, no page titles (planRDSN.md: one
strip, content immediately beneath).

### Products page — `manage/page.tsx` (rewrite) + new components
Replace the `console-split` list+inspector with a **`DataTable`**:
- Columns: **Photo** | **Created** (with a small green *modified* date subline when changed) |
  Name | Category | Sub-category | Price (struck + discounted when active) | Delivery time |
  **Saves** | **Likes** | **Actions** (Open · Delete · Analytics). Sortable headers via `useTableSort`.
  Each action opens a popup: **Open** = the edit popup below; **Analytics** = a per-product
  behaviour/performance popup (views, add-to-cart, likes/saves over time); **Delete** =
  confirmation popup (`useConfirm()`).
- Row click → **Open popup** (Aptiv-style, wide centered modal portaled to `.console`):
  - **Photos**: add / delete / per-image alt text (reuse `PieceInspector` Photos logic,
    `PieceInspector.tsx:271-375`).
  - **Words**: a **language dropdown** (EN/AR) that reveals name + description for that
    language (underlying model stays bilingual `title_en/_ar`, `description_en/_ar`). Price,
    **discount** (kind + value + on/off), delivery time are single/global fields.
  - **Attributes** (new, Aptiv-`PartsEditor` pill pattern): add measures (plain like S/M/L/XL,
    or typed `Height:180cm`), colours (value + hex → circle swatch), materials — one or many,
    each removable.
  - **Likes/Saves** shown read-only (totals).
  - **DELETE** the batch (1 2 3 tally) and variants sections from `PieceInspector`.
- **Add popup**: Category (dropdown + add/modify/delete, modify/delete emphasized after
  selecting a row) → Sub-category (same) → Product (Add/Modify opens the same Open popup).
  Reuse `manage/categories/page.tsx` logic for the category tree operations.

### Customers page — `manage/customers/page.tsx` (rewrite to full table)
`DataTable`: Created | Name | Phone | Email | Type (auth/guest) | Total spent | Total products |
Saves | Likes | Actions. **All three actions open a popup** (each portaled to `.console`):
- **Open** → Aptiv-style centered popup (not the split): full profile — address, city, email,
  phone, type, orders list, spent/products/saves/likes.
- **Analytics** → its own popup: the customer's **behaviour** view (visits, funnel, dwell,
  liked/saved pieces), built from the existing `signals`/analytics aggregation.
- **Block** → **confirmation popup** ("Block this customer/device?"), then applies the account
  `is_active` toggle and/or a device `Blocklist` entry. Uses the existing `useConfirm()` pattern.

### Feed page — `manage/feed/page.tsx`
Keep as-is. Add the auto-rotating statistical-cohort idea as a **todo.md** entry only.

### Logs door — new `admin/logs/**` (basic)
Simple `DataTable` (no extra chrome): time | level | kind | message | ip. **Danger rows red.**
Row → event detail (device fingerprint / account). **Block device** action → confirm → popup
enforcement. Add **Logs** as the 5th door in the `AdminShell` rail.

---

## Customer-facing (`frontend/src/app/[lang]/`)

- **Discount display** on product pages (`piece/[slug]/PieceView.tsx`): struck-through original
  + reduced price + badge, only when `discount_active`.
- **Heart (like) + Save (buy-later)** buttons on product cards/pages, posting to the new
  endpoints with the existing visitor fingerprint; optimistic toggle.
- **Blocked popup**: when the API returns the block 403, render "You are blocked for security
  reason — contact support 0623842535 or mostyle.service@gmail.com".

---

## todo.md (new, repo root)

Create `todo.md` capturing the deferred items verbatim-in-spirit:
1. **Feed auto-rotating statistical cohorts** — 5 behavioural stats, 20% buckets, weekly
   rotation; cold-start week; Weibull/ML forecast of next-7-day users; **ads-period
   declaration** so the model separates ads vs non-ads behaviour. (Lives in the Feed page later.)
2. **Data door** — incremental, query-based daily backup (one evolving backup, push new
   queries, not 60 full dumps).
3. Any follow-ups discovered during the build (e.g. dropping deprecated `ProductVariant`).

---

## Shared-file changes I will log for CLAUDEORDERDOOR

To be written into the `messages of CLAUDEMANAGDOOR{{{ }}}` block as I make them:
- `AdminShell.tsx` — added **Logs** door (5th) to `DOORS`; manage quick-pages now `[Products,
  Customers, Feed]`.
- `ui/primitives.tsx` — any new primitive (e.g. a colour-swatch pill, date-range control,
  wide-modal variant) added **additively**; nothing removed/renamed.
- `console.css` — new scoped rules only (swatch, wide modal, red log row); no token/reset changes.
- `models/catalog.py`, `catalog/schemas.py`, `catalog` router, `modules/admin/customers.py`,
  `main.py` middleware — enumerated with the exact symbols added.

---

## Verification (for whoever runs Docker/tests after)

1. **Migrations**: `alembic upgrade head` applies the new tables/columns cleanly.
2. **Backend**: existing `backend/tests/` still pass; add focused tests — attribute CRUD,
   like/save toggle idempotency (unique constraint), discount `effective_price`, blocklist 403,
   customer aggregation includes saves/likes.
3. **Admin UI**: Products table sorts by each header; Open popup edits photos/words/attributes/
   discount and persists; Add popup manages categories→subcategories→products; Customers table
   Open/Analytics/Block work; Logs shows danger rows red and Block-device produces the popup.
4. **Storefront**: discount renders only when active; heart/save toggle and survive reload
   (same fingerprint); blocked device sees the support popup.
5. Use the `browser-automation` / `run` skills to load `/admin/manage` and a product page and
   confirm no `.console` portal regressions (popups render styled, not as raw text).



# CLAUDEORDERDOOR — Order Door rebuild plan

## Context

Two Claude sessions are splitting the M-StyLe admin console rework driven by
`requirementMOdification.md`. **CLAUDEMANAGDOOR** owns the *Manage door*
(products/catalog, customers, feed, data/backups, live-logs). **I,
CLAUDEORDERDOOR**, own the *Order door*: the **Orders**, **Custom** (formerly
"Commission"), and **Messages** sub-tabs, plus their shared header. Neither of
us runs Docker or the test suite; the owner picks one of us for that afterward.

Today's admin doesn't literally match the spec's "top header" wording: there's a
side **Rail** with four doors (Board / Orders / Assistant / Manage), and
Orders/Commissions/Messages are three sub-routes under the Orders door, switched
by [`SectionSwitch.tsx`](frontend/src/app/admin/orders/SectionSwitch.tsx). Each
page renders its own `ControlStrip` (filters + search). The rework reshapes that
strip into the spec's 3-section header and upgrades the tables/modals.

Styling is plain CSS scoped under `.console` in
[`console.css`](frontend/src/app/admin/console.css), composed from primitives in
[`ui/primitives.tsx`](frontend/src/app/admin/ui/primitives.tsx) (`DataTable`,
`Drawer`, `ControlStrip`, `Pill`, `Segmented`, `QuoteForm`, etc.). Both projects
even share the same font stack, so the Aptiv intervention look (pill row +
key/value `detail-list` + `PartsEditor` chips) ports cleanly.

### Owner decisions (already answered)
- **Order "Delete"** → **soft-delete** (hide/archive, reversible). Orders stay in
  the DB; a hidden filter brings them back.
- **Delivery countdown** → **add a `promised_for` date to orders**, admin-editable,
  defaulted from item lead-times; countdown = days until that date.
- **Header** → **reshape the existing `ControlStrip`** into filters | search |
  quick-nav; keep the side Rail.
- **WhatsApp** → keep the one-tap prefilled `wa.me` link + the existing auto-email
  on status change; a Business-API auto-send is a TODO, not built now.

### Shared-file coordination (both doors edit these)
`types.ts`, `api.ts`, `console.css`, `primitives.tsx`, `SectionSwitch.tsx`. I will
only **append** my order-door sections and keep edits localized to avoid clobbering
CLAUDEMANAGDOOR. Flag any overlap in the handoff summary.

---

## Backend changes

### 1. Order model + migration — [`models/orders.py`](backend/app/models/orders.py)
- Add `promised_for: Mapped[date | None]` (delivery deadline for the countdown).
- Add `hidden_at: Mapped[datetime | None]` (soft-delete/archive marker).
- New Alembic migration following the existing naming
  (`backend/alembic/versions/`, latest is `20260811_1900_archive_contact_messages.py`):
  `add_order_promise_and_hidden` — two nullable columns.

### 2. Order schemas — [`orders/schemas.py`](backend/app/modules/orders/schemas.py)
- `OrderResponse`: add `promised_for: date | None`, `has_account: bool` (derived
  from `customer_id is not None` → Guest vs Verified), `hidden: bool`.
- `OrderItemResponse`: add best-effort `category` / `subcategory` names (joined
  from the product; null when the product was archived) so the modal can show the
  "Category · Sub-category · attributes" breakdown the spec asks for.
- New `PromiseChange { promised_for: date }`.

### 3. Order routes — [`orders/routes.py`](backend/app/modules/orders/routes.py)
- `GET /admin/orders`: add a `city` filter and a `hidden` flag (default **excludes**
  hidden). `q` already searches ref/phone/name — keep it.
- `GET /admin/orders/cities` → distinct cities among **non-hidden active** orders
  (feeds the dynamic City filter).
- `POST /admin/orders/{reference}/promise` → set/modify `promised_for`.
- `POST /admin/orders/{reference}/hide` and `.../unhide` → soft-delete toggle.
- `_out` helper: populate the new response fields.

### 4. Order service — [`orders/service.py`](backend/app/modules/orders/service.py)
- On `place_order`: default `promised_for = order date + max(item lead_time_days)`
  when any made-to-order line exists, else leave null.
- `set_promise`, `hide_order`, `unhide_order` helpers. Hiding never touches stock
  or status — it's purely a view filter (Cancel remains the stock-reversing move).

### 5. Custom/Requests — [`models/requests.py`](backend/app/models/requests.py), [`requests/schemas.py`](backend/app/modules/requests/schemas.py), [`requests/routes.py`](backend/app/modules/requests/routes.py)
- Add `hidden_at` to `CustomRequest` (+ migration) and hide/unhide endpoints (soft-delete).
- `RequestOut`: add `category_name` (resolved from `category_id`) so the Custom table
  has a real Category column, and `hidden: bool`.
- `GET /admin/requests`: add `category_id` + date-range filters and the `hidden` flag.

### 6. Notify — [`notify/service.py`](backend/app/modules/notify/service.py)
No structural change. Optionally include `promised_for` in the order status-email
copy (reuses `ORDER_COPY` + `send_order_update`). WhatsApp stays the existing
`whatsapp_url` click-to-chat link on `OrderResponse`/`RequestOut`.

---

## Frontend changes (admin console)

### 7. Shared lib
- [`types.ts`](frontend/src/lib/console/types.ts): extend `AdminOrder`
  (`promised_for`, `has_account`, `hidden`, item `category`/`subcategory`) and
  `AdminRequest` (`category_name`, `hidden`).
- [`api.ts`](frontend/src/lib/console/api.ts): add `setOrderPromise`, `hideOrder`,
  `unhideOrder`, `orderCities`, `hideRequest`; extend `orders(...)` with `city`/`hidden`
  and `requests(...)` with `categoryId`/date/`hidden`.

### 8. Header reshape (all three sub-pages + [`SectionSwitch.tsx`](frontend/src/app/admin/orders/SectionSwitch.tsx))
Restructure each `ControlStrip` into three groups: **dynamic filters (left) |
global search (center) | quick-nav (right)**. Rename the "Commissions" label →
**"Custom"** in `SectionSwitch` (route path may stay `/admin/orders/commissions`;
renaming the folder is optional and noted as such). Messages hides its filter group
when not applicable, as the spec says.

### 9. Orders page — [`orders/page.tsx`](frontend/src/app/admin/orders/page.tsx) + [`OrderDrawer.tsx`](frontend/src/app/admin/orders/OrderDrawer.tsx)
- **Columns**: Date · Ref · Customer · City · Product (all items consolidated in one
  cell) · Qty (summed) · Total Amount · Delivery Countdown (from `promised_for`) ·
  Status · Actions (**Open, Delete**). Reuse `DataTable` sort (`useTableSort`) for
  clickable column sorting.
- **Cancelled row → red text**: row class keyed off `status === "cancelled"` (add one
  `.console-row-cancelled` rule to `console.css`).
- **Filters**: Date-range picker, Status (incl. Cancelled), dynamic City (from
  `orderCities`), plus a Hidden/Archived toggle to view soft-deleted orders.
- **Delete** → confirm (`useConfirm`) → `hideOrder`; reversible from the Hidden view.
- **Invoice/print**: printable invoice view (order + items + totals) via a scoped
  `@media print` block and `window.print()`, reachable from the row and the modal.
- **OrderDrawer** additions: Customer Type (Guest vs Verified) from `has_account`;
  per-item Category · Sub-category · attributes; editable **promised_for** date with
  live countdown; Personalization block *rendered only if present* (field not in the
  model yet — see TODOs). `SetStatus` already auto-emails; keep the one-tap WhatsApp link.

### 10. Custom page — [`orders/commissions/page.tsx`](frontend/src/app/admin/orders/commissions/page.tsx)
- **Columns**: Date · Ref · Customer · City · Category · Status · Actions (Open, Delete).
- **Filters**: Custom Category, Status, Date range.
- **Delete** → soft-delete via `hideRequest` + confirm.
- **Modal → Aptiv intervention style**: pill row (status + category), a key/value
  `detail-list` (customer desires, contact channels: email/phone/WhatsApp), the
  reference-photos grid, cost + "Ready in X days" inputs (reuse the existing
  `QuoteForm`), and WhatsApp/call triggers. Adopt the `detail-list`/pill layout from
  projectAntiv's `DetailModal` inside the existing `Drawer` primitive.

### 11. Messages page — [`orders/messages/page.tsx`](frontend/src/app/admin/orders/messages/page.tsx)
Unchanged except the header reshape (filter group hidden). Per spec: "retained as-is."

---

## Customer-facing ripple effects (must stay consistent)
- **`promised_for`** now rides on `OrderResponse` → surface an "arrives by / X days left"
  line on the customer **order-tracking page** under `frontend/src/app/[lang]/` (locate
  the track view during implementation; it already consumes `OrderResponse`).
- **Soft-delete** is admin-view only: the public `GET /orders/track/{token}` and
  `POST /orders/find` must **not** filter on `hidden_at` — a hidden order still tracks.
- **Cancelled-red** and the Hidden view are admin-only; no storefront change.

---

## TODOs (append to `todo.md`)
- **Personalized option flag** on orders — deferred feature owned jointly with the
  Manage door's "personalize-option"; modal renders it only when present. Don't
  advertise as live.
- **Real WhatsApp Business-API auto-send** — currently click-to-chat link only.
- (The feed statistical/behavioral model + data-backup + live-logs TODOs belong to
  CLAUDEMANAGDOOR, not this door.)

---

## Verification
- **Backend**: run `backend/tests/test_shop_flow.py` and `test_requests.py`; add cases
  for promise-set, hide/unhide, city filter, and the new response fields. Confirm the
  Alembic migrations apply cleanly (upgrade + downgrade).
- **Frontend**: `npm run build` in `frontend/` (prod build enforces TS — see repo
  memory). Manually: place an order → set/modify promise → see countdown; cancel an
  order → row turns red; delete → moves to Hidden → restore; print an invoice; open a
  Custom request → verify the Aptiv-style modal, quote, and category column.
- On finish, fill the `messages of CLAUDEORDERDOOR` block in
  `requirementMOdification.md` with a "did / didn't" summary for the handoff.
