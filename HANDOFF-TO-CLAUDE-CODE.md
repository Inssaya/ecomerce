# Handoff — owner answers that correct the console rebuild

**For:** the Claude Code agent continuing the M-StyLe rebuild in VS Code.
**Read order:** `GLOBAL-PLAN.md` first, then this file. **Where the two disagree,
this file wins** — it carries the owner's answers from a live Q&A session that
happened *after* the four sessions were written, and it reverses specific
decisions the plan recorded as settled.

**Authority:** the plan named `requirementMOdification.md` as source of truth.
That spec was written before the owner had seen the built result. Several lines
in it, and several `D`-decisions built on it, no longer match what the owner
wants. Every reversal below is quoted from the owner directly. Do not re-derive
intent from the old spec where this file contradicts it.

**State of the repo:** a `main` branch now exists (created from
`claude/monolith-rebuild-5xzsfl`, which held all four sessions). It is the first
stable reference this project has had — the absence of one is the root cause of
the drift described in §6. **Fork every new slice from `main`.** Do not run
Docker, migrations, or the test suite unless the owner asks; migrations are
hand-written, never `--autogenerate` (unchanged from the plan's §1 rules).

---

## 1. The business model — internalize this before touching code

The shop has **two separate customer journeys**. They render similarly and the
previous sessions blurred them into one `Product.kind` enum. They are not two
kinds of product. They are two paths.

|  | **Store order** | **Custom request** |
|---|---|---|
| Starts from | a product we listed | the customer's own idea |
| Price | known up front | unknown — set by us after we see the request |
| The phone call | confirmation only | gather details **and** set the price |
| Entry point | product page → checkout | the `/ask` form, from scratch |

The custom request **does not start from a store product.** It starts from the
customer's head, constrained only to our category scope (e.g. "3D-printed
glasses"). This is why `CustomRequest.product_id` (built for "I want *this*
product, modified") has no place — see finding **C4**.

### Store journey (6 stages)
```
1. customer places the order        → placed
2. we see it                        (internal, no state)
3. we call to confirm               → confirmed
4. prepare & pack                   → preparing
5. ship                             → out_for_delivery
6. received                         → delivered
```

### Custom journey (6 stages)
```
1. customer describes it + photo/file
2. we contact them for more detail
3. we send an invoice + call to confirm request AND price
4. prepare
5. ship
6. received
```

**Never surface production problems in the storefront.** If we can't make
something, that is a private phone conversation. No "out of stock", no "we
couldn't", nothing of the kind anywhere the customer can see.

---

## 2. Decisions REVERSED from GLOBAL-PLAN.md — do these

The agent that wrote the plan will read these `D`-numbers as final. They are not.
Each row is the owner's new answer and overrides the plan.

### R1 — No stock, anywhere. Reverses the compromise in §9 "Session 1.1"
The rebuild already stopped *counting* stock, but kept the `Piece` table and
`PieceState` as dead scaffolding. The owner is unambiguous: **there is no stock,
visible or internal, ever. An order is never refused.**
- Delete `class Piece` (`backend/app/models/catalog.py:425`) and
  `class PieceState` (`:73`), plus their exports in `models/__init__.py`.
- Delete `PIECE_STATE_FOR_ORDER` and the "puts its pieces back on the shelf"
  logic in `backend/app/modules/orders/service.py` (~`:54`, ~`:257`) — dead since
  reservation was removed.
- Delete `show_piece_numbers` and piece-number rendering (`01/03`).
- Migration to drop the `pieces` table and the `piece_state` enum.

### R2 — Manufacturing time is deleted. Reverses D5 (partial) and the `ck_workshop_has_lead_time` constraint
The owner does not want a manufacturing-time concept at all.
- Delete `lead_time_days` from `catalog.py:233`, `orders.py:147`,
  `requests.py:109`, and `models/local.py`.
- Delete the `ck_workshop_has_lead_time` CheckConstraint (`catalog.py:167`).
- `Quote.lead_time_days` (`modules/requests/schemas.py:50`) is **mandatory**
  today and will break — replace it with a delivery date, or drop it (finding C3).
- Migration for the column drops and the constraint drop.

### R3 — Delivery time stays, but ADMIN-ONLY. Reverses D5 (the visible part)
D5 said `delivery_days` is "set and edited in the Products table … for shelf and
workshop pieces alike" and feeds a customer-facing countdown. The owner's new
answer: **keep `delivery_days` in the database and the admin door, but show it to
no customer.** Rationale, his words: "we're studying the market now… we'll show
delivery time later when the business grows."
- Keep `Product.delivery_days` (`catalog.py:214`) and `Order.promised_for`
  (`orders.py:97`) as columns and in admin UI.
- Remove `delivery_days` / `promised_for` / any countdown from every
  **customer-facing** response schema and page (storefront product page,
  `/track/[token]`). Strip the countdown the storefront currently renders.

### R4 — One price per product. Reverses the `price_max` field
"One product, one price. There is no price_max or price_min or price range."
The range was an example the owner gave, not a requirement.
- Delete `Product.price_max` (`catalog.py:235`) and every read of it. Migration.

### R5 — Delete `kind` entirely. Reverses D-decisions that assume shelf/workshop
After R1 (no stock), R2 (no manufacturing time) and R4 (no price range),
`ProductKind` distinguishes nothing. The owner: "delete kind." (Session `000cc10`
tried this and walked it back — do not walk it back again; the earlier reversal
happened only because stock and time still existed. They no longer will.)
- Delete `class ProductKind` (`catalog.py:61`), `Product.kind` (`:173`), the
  `is_shelf` property, and every branch on it:
  `catalog/service.py:102,120,191`, `catalog/schemas.py:141`,
  `catalog/routes.py:112,179,222,229,273,326`,
  `ai/shopper.py:65,66,79,119,143`, `admin/metrics.py:258`,
  `orders/service.py:118`. Migration to drop the column and `product_kind` enum.

### R6 — Custom approval is a phone call, not a customer button. Reverses the `/approve` endpoint intent
The custom flow currently lets the customer click **Approve** on a quote
(`modules/requests/routes.py:71`). The owner confirms the request and price **by
phone**, then moves the state himself.
- Remove the customer-facing approve action from the storefront.
- Keep the state transition, driven from the admin door after the call.

---

## 3. Decisions CONFIRMED — do NOT "improve" or undo these

The previous sessions built these correctly. The owner reviewed them and wants
them kept as-is. Flagged because a well-meaning agent might touch them.

- **D7 Discount** — `discount_kind (percent|fixed)` · `discount_value` ·
  `discount_active`, per product, off by default, manually switchable. Matches
  the owner's ask word-for-word ("percent or number, we enable/disable it
  manually, not on all products"). `effective_price()` on the model is the single
  source of truth (`catalog.py:274`). Keep the negative-price guard (`:290`).
- **D4 Personalization** — per-product toggle + percent markup; customer field is
  their name, 20 chars; server applies the markup (a lying client is still billed
  right); order of operations is **discount first, then markup on the discounted
  price**. Owner confirms it is optional per product and changes nothing else in
  the flow — "we just write his name on his order."
- **D1–D3 Attributes** replacing variants; **D6 `visitor_id`**; **D8 archive-not-
  delete** (but see C6 for the one thing it's missing); the order-status state
  machine. Unchanged.

---

## 4. Work the plan never built — these are new

Confirmed by the owner as required, and absent from the four sessions.

- **C1 — Customer-facing PDF invoice.** No PDF library exists in
  `backend/requirements.txt`. Today the only invoice is an admin print view
  (`frontend/src/app/admin/orders/OrderPopup.tsx`). Owner wants a real PDF the
  customer can open from `/track/[token]`, carrying name, address, all customer
  info, order lines, and date.
- **C2 — Auto invoice email after checkout.** Only a status-change email exists
  (`modules/notify/service.py:261`). Send the invoice automatically on
  `placed`. SMTP already works (`notify/email.py`) — do not build a mailer.
- **C3 — Custom invoice, editable.** Sent after we set the final price; **editable
  by us at any time**; carries the customer's request + service price + customer
  info + date. Does not exist. This is where `Quote.lead_time_days` (R2) becomes
  a delivery date instead of a "ready in X days" manufacturing promise.
- **C4 — Drop `CustomRequest.product_id`** (`requests.py:93`) — see §1, the custom
  request starts from an idea, not a product.
- **C5 — Missing custom stages.** Current: `requested → quoted → approved →
  in_production → ready → delivered`. Add a "**contacting for details**" stage
  (between requested and quoted) and make the **shipping** stage explicit (today
  it jumps `ready → delivered`). Reconcile against the 6-stage journey in §1.
- **C6 — Customer self-cancel.** No cancel endpoint exists at all; `cancelled` is
  admin-only today. Owner's rule: a **registered** customer may cancel, and only
  while `placed`. Once the confirmation call flips it to `confirmed`, cancellation
  goes through us. Build a customer endpoint guarded on both `has_account` and
  `status == placed`.

---

## 5. Security — carry these over (low risk, do them anytime)

Verified against `main`. Most of the prior review's fixes already landed in the
four sessions; only these remain:

- **S1** — `python-jose[cryptography]==3.3.0` → `3.5.0` in
  `backend/requirements.txt`. CVE-2024-33663, CVE-2024-33664. No code change.
- **S2** — nginx is missing `X-Frame-Options` and `Referrer-Policy`, and has
  `X-Content-Type-Options` in only one `location`. Add all three at the `server`
  level in `infra/nginx/conf.d/mostyle.conf`. Note: `add_header` is **not
  inherited** by any `location` that declares its own headers — put them where
  they'll actually apply.

*(Already fixed on `main`, do not redo: empty-`JWT_SECRET` refusal, category
cycle prevention, email-value escaping.)*

---

## 6. Why this happened — so it doesn't again

The repository had **no `main` branch and no default branch.** Three `claude/*`
branches, each forked from wherever the last one happened to be. That is the
mechanical cause of every contradiction:
- one session deleted `kind` and another restored it,
- one added a per-product delivery time the owner never wanted shown,
- a prior "line-by-line review" read code that was 39 commits stale and reported
  problems in already-deleted files.

`main` now exists. **Before more work:** set `main` as the default branch on
GitHub, delete the stale `claude/ecommerce-saas-microservices-5xzsfl` (a direct
ancestor of `main`, nothing unique), and fork all future slices from `main`.

---

## 7. Suggested order

1. **Cleanup (low risk, shrinks the code):** R1, R5 dead branches, S1, S2.
2. **Schema alignment (one migration chain):** R2, R3, R4, R5 column/enum drops,
   C4. Each migration hand-written on the previous head.
3. **Custom flow:** C5 stages, R6 phone confirmation.
4. **Invoicing (largest):** C1, C2, C3.
5. **Cancellation:** C6.

---

## 8. Still open — ask the owner before building

1. **Payment** — cash on delivery only, or others?
2. **Delivery fee** — `Order.delivery_fee` and `local.py` `delivery_days_min/max`
   per city exist. What is the actual rule?
3. **Category depth** — category → sub-category only, or deeper?
4. **The AI assistant** (`modules/ai/shopper.py`) — keep or remove? It is a large
   surface and several findings touch it.
5. **`ready` order status** — the owner listed 6 store stages without it; keep it
   or fold it into preparing / out-for-delivery?

---

*Every finding above is `file:line`-anchored against `main`. Open in VS Code and
jump straight to it.*
