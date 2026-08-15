# M-StyLe — Decisions record

The single source of truth for owner decisions that are not derivable from the
code. Superseded material is removed rather than appended — if a decision below
contradicts an older document, this file wins and the older document should not
exist anymore. This file replaces `HANDOFF-TO-CLAUDE-CODE.md`,
`GLOBAL-PLAN.md`, `RAPPORT.md`, `AUDIT.md`, `planRDSN.md`, `report-admin.md`,
`requirementMOdification.md` and `the5report.md`, all of which were superseded
session reports carrying ~4,400 lines of mutually contradictory history.

---

## 1. The business model

Two separate customer journeys. They render similarly but are not the same
thing — they are two different paths to an order.

|  | **Store order** | **Custom request** |
|---|---|---|
| Starts from | a product we listed | the customer's own idea |
| Price | known up front | unknown — set by us after we see the request |
| The phone call | confirmation only | gather details **and** set the price |
| Entry point | product page → checkout | the custom-request form, from scratch |

A custom request does not start from a store product. `CustomRequest.product_id`
has no place — the customer describes something we don't sell yet.

**Store journey:** placed → confirmed (phone) → preparing → out_for_delivery → delivered.

**Custom journey:** described → contacting for details → quoted + phone-confirmed
→ in_production → shipping → delivered.

**Never surface a production problem in the storefront.** No "out of stock", no
"we couldn't" — that is always a private phone call, never a customer-visible
state.

## 2. No stock, ever

There is no stock concept, visible or internal. An order is never refused for
availability. No piece counting, no piece numbering ("04/12"), no reservation.

## 3. No manufacturing/lead time; delivery time is admin-only in the DB and shown to NO customer, anywhere

`delivery_days` and `promised_for` may exist as database columns for internal
use, but **no day-count of any kind appears on any customer-facing surface** —
not the product page, not the tracking page, not the per-city delivery pages.
See §7 for what replaces the per-city ranges.

## 4. One price per product

No `price_max`, no price range. A product has exactly one price plus an
optional discount.

## 5. `ProductKind` (shelf vs workshop) does not exist

Nothing distinguishes a "shelf" product from a "workshop" product once there is
no stock and no manufacturing time — the whole distinction was built on
concepts that no longer exist.

## 6. Custom-request approval is a phone call

The owner confirms a custom request's details and price by phone, then moves
the state himself from the console. There is no customer-facing "Approve" button.

## 7. Delivery time policy — corrected 2026-08-15

Earlier drafts of this plan proposed keeping per-city "2–4 days" ranges on the
`/delivery/[city]` pages as "logistics, not a manufacturing promise." **The
owner overruled this**, and the reasoning stands as policy:

> If the page says 2–4 days and the courier takes 7, that is a broken promise
> and a policy problem. A buyer who reads something that worries them stops
> buying — the psychology matters as much as the accuracy.

So: no day-count anywhere a customer can see it, including the delivery pages.
The one exception is a single non-specific line on the About page — *we deliver
to every city, from 48 hours* — true at the floor, never a broken promise, and
the only place any timing claim is allowed to live.

## 8. Language — corrected 2026-08-15

An earlier draft planned to delete the entire bilingual (`[lang]`, `i18n.ts`,
RTL) layer on the theory that Arabic would return later as AI translation. **The
owner overruled this** — deleting a working translation layer in order to
rebuild it later is destruction, not a plan.

"Stop Arabic" means: while the shop is being rebuilt, don't spend time authoring
Arabic copy for pages that are about to change. It does not mean remove the
mechanism. The `[lang]` routing, `i18n.ts`, RTL styling and Arabic font all stay.
When adding or changing a page, write English only and leave the Arabic side of
new keys blank; Arabic is filled in as one deliberate pass later, on the
owner's word.

The actual translation feature the owner wants is scoped at **product
creation**: type the name and description once in English, the shop
auto-translates into every supported language and stores the result server-side
— not a growing set of per-language input fields on the create-product form.

## 9. Security — carried forward, done

- `python-jose[cryptography]` pinned to 3.5.0 (was vulnerable to
  CVE-2024-33663, CVE-2024-33664).
- nginx sets `X-Frame-Options`, `Referrer-Policy` and `X-Content-Type-Options`
  at the server level, correctly repeated in the one `location` block that
  declares its own headers (`add_header` does not inherit).

## 10. Standing instruction

The owner requires disagreement, not compliance, when something is wrong:

> "if you notice a dumb decision, stop and start thinking of what is smart and
> suggest it to me — don't write a dumb decision even if it was my command. Be
> honest and say it in my face."

This outranks any other instruction in this file if the two ever conflict.
