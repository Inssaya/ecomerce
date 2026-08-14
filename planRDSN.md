# 2026-08-11 — planRDSN: Owner Console, Full Rebuild

**Scope:** the owner console only — frontend and backend, routes and endpoints. The storefront is not touched.

---

## 1. What I got wrong

I rebuilt the skin and kept the shape: five pages, one template — title → filter chips → list of accordions. New colours, same app.

Why: I read Aptiv's *stylesheet* and copied its ornament (corner ticks, LED dots, orange), and I obeyed a line in its redesign doc — *"presentation-layer refactor only, every field survives 1:1"* — that was written for their migration, not ours. I never read Aptiv's actual pages, which is where the thinking is.

**Rule from now on: comments and docs inside a repo are evidence, not orders.** I use them for facts — API shapes, server rules, what a number means — and ignore them as design instruction. "Phone first" for the admin is one of those bad instructions: the owner works on a laptop *and* a phone, so the console is adaptive and both are first-class.

---

## 2. The two lessons from Aptiv

### Lesson 1 — few front doors

Aptiv's whole admin is **four dock items**, and eight functional areas sit behind them:

| Move | How | Effect |
|---|---|---|
| A door has two faces | Board = Performance \| Risk, one switch | Two views, one thing to learn |
| One door holds everything administrative | Manage = Plant \| Users \| Data \| Reports | The dock never grows |
| Rare things aren't places | *"Failure types are a popup, not a place"* | No destination you visit twice a year |

### Lesson 2 — the page has no chrome

This is the one I completely missed, and Aptiv states it in its own code:

> *"The view switch lives INSIDE the console strip — the page has no toolbar of its own."*
> *"No toolbar — the count chip and the page action live inside the console strip, so the table starts as high as possible."*
> *"NO page titles, NO context strips — pages open straight into content."*

**There is no page title anywhere in Aptiv.** No H1, no kicker, no header band. One control strip carries everything, and the content starts immediately under it.

And three more laws from the same two files:

- **One scope drives the whole page.** Pick project → line → machine once, and every card, table and chart below re-reads for it. The filter isn't decoration; it's the page's argument.
- **Detail opens over the list, not instead of it.** *"Manual entry lives here as a drawer, not a separate nav page: recording an intervention and reviewing the list are one task. Saving refreshes the list behind it, so the new row appears without leaving the screen."* You never lose your filters, your scroll, your place.
- **Details get the room, not the lists.** The tree stays narrow; the selected thing fills the space.

---

## 3. The page anatomy — every screen, same bones

```
┌─ CONTROL STRIP ─────────────────────────────────────────┐
│ ▸ PERIOD   this month ▾                                 │
│ ▸ SCOPE    all categories ▾   all pieces ▾    [47] [⇄] [+ New]
└─────────────────────────────────────────────────────────┘
      ↓ everything below answers for that scope
   content — starts as high as possible, no title
```

- **No page title.** The dock says where you are. The content says what it is.
- The strip holds **labelled filter groups**, and on its right the **count**, the **view switch** and the **one page action**.
- **Filters scope everything below them.** On Board that means period + category + piece; change the piece and every number on the screen is about that piece.
- **Detail = drawer (desktop) / full-screen sheet (phone)**, opened over the list, with the record in the URL (`?open=MS-1043`) so it stays linkable and the back button closes it.
- **Lists load 30 at a time** with "Load more", first page cached for instant paint on return.
- **Numbers show against their target** where one exists — a pill only when it's failing, never a bare figure.
- **Row actions are always visible**, never revealed by expanding.

That anatomy replaces: the kicker+H1 on five pages, the separate chip rows, the accordion, and the four levels of disclosure in the current build.

---

## 4. Four doors

```
BOARD      how is the shop doing, and what should I make?
ORDERS     who is waiting on me?
ASSISTANT  ask anything
MANAGE     set up what we sell and how it's shown
```

| Door | Faces / sections | Routes |
|---|---|---|
| **Board** | **Today** · **What to make** | `/admin` · `/admin/make` |
| **Orders** | **Orders** · **Commissions** · **Messages** | `/admin/orders` · `/orders/commissions` · `/orders/messages` |
| **Assistant** | — | `/admin/assistant` |
| **Manage** | **Pieces** · **Categories** · **Customers** · **Feed** | `/admin/manage` · `/manage/categories` · `/manage/customers` · `/manage/feed` |

Ten areas, four doors. Sections are real routes — deep-linkable — they just aren't dock items.

**Not destinations** (drawers and popups): new piece · new category · quote form · batch editor · embeddings refresh · every record detail.

Nav: **≥1024** left rail with labels · **768–1023** icon rail · **<768** bottom bar. Four items fits all three with no "More".

---

## 5. Board — `/admin` · `/admin/make`

Two faces on one switch, inside the strip.

**Strip:** `PERIOD this month ▾` · `SCOPE all categories ▾ all pieces ▾` · `[Today | What to make]`

### Today
```
"2 people are waiting on a price. The oldest has waited 3 days."

┌ 4 to confirm ┬ 2 quotes ┬ 7 unread ┐   ← links into Orders
└──────────────┴──────────┴──────────┘

REFUSAL  17% ████████░░░  target 8%       ← against its target, not bare
3 of 17 came back · worst Fès 2/4
"A refused parcel means the box surprised someone."

30 DAYS  collected · avg order · visitor→order · cart→order
VISITORS ╱╲╱‾╲╱╲___╱‾╲
WHERE THEY STOP  ▓▓▓▓▓▓ → ▓▓▓▓ → ▓▓ → ▓
```
Lead sentence computed in priority order: refusal over target → someone waiting → shelf won't cover the week → revenue vs last period. Every queue number links. All five KPI explanations inline (today one of five is used). Every funnel step prints what it lost.

**Backend new:** `GET /admin/today` — one call for the lead figures, queue counts, funnel and visitors, honouring the strip's period and scope. It also returns **daily revenue** alongside daily visitors, so the revenue tile can carry a sparkline — today only visitor counts have a daily series, which is the less useful of the two to an owner.

### What to make
Evidence stacked most-direct first, so the order teaches which signal to trust:
```
ASKED FOR BY NAME     someone typed what they want     ← strongest
WAITING ON A PIECE    would have paid, at a price seen
SEARCHED, FOUND NONE  came wanting it, left empty
CATEGORY ATTENTION    weakest — labelled as such
─────────────────────────────────────────────
THE SHELF    running out ▸ 3     dead stock ▸ 5
NEXT 7 DAYS  "about one a fortnight" · range · runs
             out in 4 days · make 2 · and why
```
**Backend new:** `GET /admin/waiting` (who waits on which piece — only a per-product count exists today, and this is the sharpest demand signal the shop has) · `?limit=` on the unmet lists, which silently truncate at 20.

**What changes:** *what should I make next* is the workshop's central question and there is no screen for it today — the endpoint has never been called.

---

## 6. Orders — `/admin/orders`

**Strip:** `PERIOD ▾` · `STATUS needs you ▾` · `🔍 reference, phone, name` · `[47] [Orders | Commissions | Messages]`

Opens on **needs you**, not everything newest-first.

```
2h   MS-1043  Amina · Fès      340 MAD  ●placed    ☎ ⌗ Open
1d   MS-1041  Youssef · Rabat  180 MAD  ●ready     ☎ ⌗ Open
3d   MS-1038  Sara · Casa      520 MAD  ●sent      ☎ ⌗ Open
                                        [ Load more ]
```
Age is visible — today an order has no date on it at all. Call and WhatsApp are row actions. Sortable, sticky header, 30 at a time.

**Open** slides a drawer over the list:
- **Order** — status actions **at the top** (today they sit below the items and event log, off-screen after the click that revealed them) · items **with photos** so the pick list works · address with delivery notes at real contrast · timeline with who did it · subtotal → delivery → total · the customer's tracking link.
- **Commission** — **the customer's reference photos**, the entire basis for pricing, today fetched and thrown away so the owner quotes blind · name, phone, city, budget, how long they've waited · quote form · and the **full lifecycle** quoted → approved → in production → ready → delivered (today only "declined" is wired, so you can filter to "In production" and no button reaches it).
- **Message** — real `mailto:` / `tel:` links instead of inert text.

Saving refreshes the list behind the drawer; you keep your filters and your place.

**Backend new:** `actor` on events (stored, dropped by the schema — "the system auto-cancelled after 48h" currently looks identical to "the owner cancelled") · `category_id` + `source` on requests · unread count without opening the tab.

---

## 7. Assistant — `/admin/assistant`

Kept simple. Three fixes: a failed turn currently writes a **fabricated assistant message into history** and replays it to the server as real context — failures become UI-only. `trace` shown, because the copilot's credibility rests on every number coming from a tool result. Suggestions follow what you were just looking at.

**Backend:** existing only.

---

## 8. Manage — `/admin/manage`

**Strip:** `SCOPE category ▾` · `STATUS ▾` · `🔍 search` · `[48] [Pieces | Categories | Customers | Feed] [+ New piece]`

### Pieces
Narrow list left, **big inspector right** — details get the room.
```
┌───────────────┬──────────────────────────────┐
│ ▸ Ninja Pen   │ [photo][photo][+]  cover·alt │
│ ● Book Holder │ EN Book Holder               │
│ ▸ Vortex Lamp │ AR حامل كتب                  │
│ ▸ Wifi QR     │ 245 MAD · The Shelf          │
│               │ BATCH  01 02 0̶3̶ 04          │ ← the signature
│ ⚠ 2 need a    │ saw 300 · opened 90 · sold 4 │
│   photo       │ [Publish] [Pause] [Archive]  │
└───────────────┴──────────────────────────────┘
```
List shows photo, title, **category** (invisible today), price, status, stock (guarded — it currently prints `"null on the shelf"`), and a **needs-attention mark**: draft with no photo (can't publish), shelf piece at zero, workshop piece with no lead time.

Inspector: EN and AR **readable**, not only editable — the Arabic story is four levels deep and write-only today. Batch as the tally with a real state legend (reserved/sold/kept look identical now). Variants with their own stock. That piece's funnel row from one shared load, not a refetch per piece.

**Backend new:** `PATCH /admin/media/{id}` for alt text (write-once-at-upload today and never sent, so **every photo in the shop has none**) · `PATCH /admin/variants/{id}` (create-or-retire only, so a typo is permanent) · `paused` in the status union.

### Categories
The tree, reorder, icons, EN/AR — and the active toggle rebuilt as something that **looks like a control** instead of an invisible button hidden inside a status pill. *Backend: existing.*

### Customers
Who buys, what they've spent, what they refused, their orders. (I dropped this page entirely last time — restoring it.)
**Backend new:** guard `PATCH /admin/customers/{id}/active` against guest ids — a phone string against a UUID column currently errors.

### Feed
```
┌ LEVERS ────────────────┬ WHAT IT'S PUSHING ──┐
│ their browsing  ███░░  │ 1  Vortex Lamp      │
│ similar things  ██░░░  │ 2  Ninja Pen Holder │
│ popular now     █░░░░  │ 3  Sweet Home Sign  │
│ newly made      █░░░░  │ …re-ranks as you    │
│ your boost      ██░░░  │    move a lever     │
│ already seen ▼  ██░░░  │                     │
└────────────────────────┴─────────────────────┘
```
Six levers with the owner-facing sentence already written for each in the backend. The live feed beside them — without it the sliders are blind. Per-piece **boost** (`business_boost`, called *"the lever the owner asked for"* in the spec, reachable from nowhere today). Embedding coverage and refresh.

**Backend new:** `GET /admin/feed/preview` (ranked feed with each term's contribution) · `updated_at` on weights.

---

## 9. Design language

Neither the storefront's palette nor Aptiv's — the `frontend-design` skill lists both as AI clichés (*"warm cream + serif + terracotta"* is the storefront exactly; *"near-black + acid accent"* is close to Aptiv's carbon and orange).

- **Surfaces:** true neutrals, faint warm cast. Paper in light, warm graphite in dark.
- **One accent** for "act here" only; status colours never carry meaning alone.
- **Type scale as tokens** — there are currently **zero** font-size tokens and ten magic numbers across forty-five places.
- **Numbers:** Latin always — a reference has to survive being read down a phone. But **tabular figures only where digits align vertically** (table rows, axis ticks). Hero and stat-tile values take **proportional** figures in the body sans — `tabular-nums` makes `121` look loose at display size, and a display/serif face on a hero number reads as decoration. *(Corrects my earlier "mono, tabular, always".)*
- **Icons** inline SVG; today the console uses `☎ ↑ ↓ × →` as buttons.
- **One loud thing:** the batch tally `01 02 0̶3̶ 04`. Everything else stays quiet.
- **Motion** 150–300ms, only to show a state change. **No skeleton flash on refetch** — hold the previous render at reduced opacity so nothing jumps.

---

## 9b. Charts — the right form per number

I have been carrying the same four hand-drawn shapes (sparkline, funnel bars, meter, dots) regardless of what the number needed. Picked properly, by the job the reader has to do:

| The number | Job | Form | Why not what's there now |
|---|---|---|---|
| Lead figure | the one number the screen leads with | **Hero figure**, proportional sans, with a sentence under it | today there is no lead at all — six equal tiles |
| Queue counts · avg order · returning % · actions per visitor | headline values | **KPI row of stat tiles** | correct already |
| **Refusal vs 8% target** | one ratio against a limit | **Meter with the target marked on the track**, status-coloured | today a bare `17%` — the number that decides the business, shown as plain text |
| **Worst cities** | magnitude across nominal items | **Horizontal bars, one hue, sorted** — *not* darker-where-bigger; a value-ramp on nominal categories double-encodes length as hue | today three lines of text |
| Visitors, 30 days | trend, single series | **Area** + crosshair tooltip + a real x-axis | shape is right; no hover, no axis today |
| **Revenue, 30 days** | current value + change | **Stat tile with delta and a sparkline** | needs daily revenue from the backend — currently only daily *visitors* exists |
| **Funnel, 6 steps** | ordered magnitude with drop-off | **Horizontal bars on the ordinal ramp**, every step's loss printed, biggest drop direct-labelled | today only the worst step's loss is shown; the rest are computed and discarded |
| **Forecast per piece** | point estimate *with* uncertainty | **Ranged dot plot** — expected as the dot, the Poisson interval as a whisker, sorted by expected | today text only, and `roughly()` launders `1.42` into `"about 1"`, destroying the number the range exists to qualify |
| **Days of cover** | runway, low → high, against a threshold | **Horizontal bars sorted ascending with a 7-day rule**, status colour under it | **missing entirely** — the most actionable field in the payload |
| Categories earning attention | magnitude, nominal | **Horizontal bars, one hue, sorted** | missing |
| **Best sellers — units *and* revenue** | two measures, different scales | **Table with two micro-bar columns.** Never a dual axis — it invents a correlation that isn't in the data | missing; and the disagreement between units and revenue *is* the insight |
| **Per-piece performance** | 48 rows × 5 measures | **Sortable table with micro-bars** — past ~7 classes a table beats a chart | today reachable one piece at a time, three levels deep, refetching everything each open |
| **Page performance** | same | **Sortable table with micro-bars** | the whole branch is fetched and drawn nowhere |
| Searches that found nothing | the words matter more than the sizes | **Ranked list**, no chart | correct already |
| Embedding coverage | one ratio against a limit | **Meter** | missing |

**Rules that apply to all of them**

- **Charts never use the accent hue** — a chart must never compete with a button for the same colour. Series come from their own ramp. *(The current `console.css` already gets this right; keeping it.)*
- **Status colours are reserved** for good/warning/serious/critical and never used as "series 4" — and never colour-alone; always with a label or shape.
- **One filter row above everything it scopes**, never a filter inside a chart card — which is exactly the control strip in §3.
- **Sequential = one hue light→dark. Ordered categories** (the funnel) get the ordinal ramp. **Nominal categories** (cities, pieces) get one hue for every bar.
- **Hover by default** — crosshair + tooltip on area/line, per-mark tooltip on bars and dots, hit areas ≥24px. There is not a single tooltip in the console today.
- **Every chart has a table-view twin**, so no value is reachable only by hovering.
- **Dark mode is chosen, not flipped** — its own steps off the same ramps, validated against the dark surface.
- **Palette is computed, not eyeballed** — run the validator (`scripts/validate_palette.js`) for both modes and fix anything that fails before shipping.
- Direct-label **selectively** — the endpoint, the extreme, the one series that matters. Never a number on every point.

---

## 9c. The dashboard — what comes off, what goes on

**Comes off** (present today, earning nothing):

- The **Today ⇄ Forecast toggle** — two different jobs sharing one screen. Forecast moves to *What to make*.
- **`visitor→order` and `cart→order` as separate tiles** — the funnel already shows both, in context, with the losses. Keeping both is the same data twice.
- **`shop_open_to_order_pct`** rendered as a bare `43%` with no caption and no explanation — unreadable as shipped. Either it gets its sentence or it goes.
- **Unmet demand** — belongs on *What to make*, not on the daily read.
- **`roughly()`** — stop laundering `1.42` into `"about 1"`. Show the range; that is what it is for.
- **Duplicate city** (`order.city` and `address.city` both printed on the same card).
- The **one-row `Meter` table** in a piece's report — a one-bar bar chart is a stat tile.

**Goes on** (necessary, absent today):

- The **lead figure and sentence** — the screen currently answers no question until you interpret it.
- **Refusal as a meter against its 8% target**, with `worst_cities` as ranked bars.
- **Days-of-cover runway** and the **forecast range as a ranged dot plot**.
- **Per-piece leaderboard** and **page performance**, both as sortable tables with micro-bars.
- **Returning vs new** and **actions per visitor** — fetched on every load today and never drawn.
- **Revenue trend** — needs `daily` revenue added to the backend beside daily visitors.
- **Tooltips, axes and table-view twins** on everything.

---

## 10. Under the hood

- **`useConsoleQuery`** — one hook replacing **11 copies** of load/error/retry boilerplate.
- **~60-line cache**, stale-while-revalidate, plus first-page session cache for instant paint. Kills "expand five pieces → ten heavy requests". **No React Query.**
- **URL holds everything** — filters, section, open record. Today there are 5 URLs for ~15 screens and nothing is bookmarkable.
- **Shared primitives** so money and numeral rules live in one place, not in 151 inline style objects.
- **Delete** ~20 dead CSS classes and 4 unused primitives.

**Bugs fixed:** a `cell-sub` class that matches nothing · `"null on the shelf"` · a "Stayed" header above a different number · `ArmedRemove` hardcoding black and white so it breaks in dark theme · category reorder with no error handling · customers list showing stale rows while you type · the assistant's fabricated history · the half-wired commission lifecycle · the unread badge that only appears after you open the tab it advertises.

---

## 11. Add / won't add

**Add:** the two missing areas (What to make, Feed) · four-door adaptive nav · the no-title control-strip anatomy · drawers over lists · **a chart set picked per number** (§9b) with tooltips, axes and table-view twins · the ~44 dropped API fields (commission photos, days-of-cover, order age, item photos, all five KPI explanations) · alt-text editing · SVG icons · the tally · **15 additive backend changes** (§16) · unsaved-work rescue on session expiry · confirms sized to consequence · blockers shown before the click · a dirty-form guard · **development-only seed data** — without orders, commissions and browsing history, Board and What-to-make are empty screens and none of this can be judged.

**Won't add:** React Query / Redux / any state library · a chart library · a component library · multi-user or roles · French · a notification bell · demo or mock data · a blog · bulk import · an audit log · a separate media library · emoji icons · decorative animation · any storefront change · Aptiv's ornament as decoration.

---

## 12. Order of work

| # | | |
|---|---|---|
| 1 | Foundation | tokens, icons, query hook + cache, adaptive shell + four-door nav, **control strip + drawer primitives**, dead code out, bugs fixed |
| 2 | Backend | the 15 additive changes, to the schemas in §16.5 |
| 3 | Seed data | orders, commissions, messages, signals — dev-only, refuses to run in production |
| 4 | **Board** | Today · What to make |
| 5 | **Orders** | queue · drawer · full commission lifecycle |
| 6 | **Manage** | Pieces · Categories · Customers · Feed |
| 7 | **Assistant** | trace, history fix |
| 8 | Verification | below |

---

## 13. Verification

`docker compose up -d` · owner login · console on `:3000`, API on `:8000`.

- Every screen driven headless at **375 / 768 / 1024 / 1440**, both themes, screenshots reviewed
- Zero console errors and zero failed requests on every route
- Every mutation exercised against the real API
- Contrast ≥ 4.5:1 · visible keyboard focus · no icon-only button without a label · reduced-motion honoured
- **Chart palette run through `validate_palette.js` for light *and* dark**, every FAIL fixed before shipping — colourblind-safety is computed, never eyeballed
- **Every chart checked against the anti-pattern list**: no dual axis, no value-ramp on nominal categories, no number on every point, no tooltip-only values, axis band inside the container
- Reload and back-button on a filtered list and an open drawer both land where they should
- Typecheck and a clean production build

---

## 14. Accent — settled

**Aptiv's own orange. Light theme is the primary; dark is the secondary.**

| Token | Light (primary) | Dark |
|---|---|---|
| `--accent` | `#e56207` | `#ff7a1c` |
| `--accent-hi` | `#c95300` | `#ff9147` |
| `--accent-dim` | `rgba(229,98,7,.10)` | `rgba(255,122,28,.13)` |
| `--on-accent` | `#ffffff` | `#190f05` |

The accent is for *"act here"* only — primary buttons, the active nav item, focus rings. **Never a chart series** and never a status. Status keeps its own reserved set; charts draw from their own ramp.

---

# 15. Full diagnostic — every page

Nothing below is read from live data. This is the assumption pass: what the admin sees, what they can and cannot do, what goes wrong, and the answer to each.

## 15.0 — Dangers that apply to every page

These bite everywhere, so they are solved once in the foundation, not per screen.

| # | What happens | Why it hurts | The answer |
|---|---|---|---|
| 1 | **Session expires mid-edit.** Token lives an hour; refresh is spent automatically, but if refresh fails the console calls `window.location.reload()` | **Every unsaved edit is destroyed silently.** The owner is typing a quote and loses it | Before bouncing: stash unsaved form state in `sessionStorage` keyed by record, show *"Signed out — sign in to save"*, restore after sign-in. Never a silent reload |
| 2 | **Two devices open.** Owner confirms an order on the phone; the laptop still shows "placed" and offers Confirm | Server rejects the move; today the owner just sees *"the server refused that move"* | On a rejected transition, refetch that record and redraw the legal moves: *"This order already moved to Confirmed."* Refetch the open record on window focus |
| 3 | **A write that notifies the customer** (status move, quote, adding pieces) | An optimistic UI shows "delivered" before the server agreed — the owner believes a customer was told when they weren't | **Never optimistic for anything that sends a message.** Pessimistic write, spinner on the button, state changes only on the server's answer |
| 4 | **Double click on submit** | Two quotes, two notifications, two batches | Every mutating control disables on submit until resolved. Non-negotiable |
| 5 | **Arabic content inside an English console.** Titles, descriptions, stories, category names, customer names and addresses can all be Arabic | In an `dir="ltr"` container, Arabic renders with punctuation on the wrong side and mixed strings reorder — `"حامل كتب (2)"` breaks | Every field that *can* hold Arabic gets `dir="auto"` on display; every `*_ar` input gets `dir="rtl"`. Numerals and references get `dir="ltr"` + `unicode-bidi: isolate` so `01/12` never flips |
| 6 | **Slow or flaky network** | A skeleton flash on every refetch makes the page jump | Hold the previous render at reduced opacity. Skeletons only on first paint |
| 7 | **Division by zero** — average order with no orders, conversion with no visitors, rates with an empty denominator | `NaN`, `Infinity%`, or `0%` presented as fact | One `ratio()` helper. No denominator → render `—`, never a number |
| 8 | **Timezone.** "Today" is computed server-side; the shop is UTC+1 | If the server counts in UTC, "orders today" resets at 01:00 local and the owner sees yesterday's number at midnight | Pin the day boundary to the shop's timezone server-side, and label the period explicitly |
| 9 | **Raw customer text rendered in the console** — search terms, descriptions, messages | Layout breaking on a 2,000-character string; and never `dangerouslySetInnerHTML` | Clamp with expand; React's default escaping only; no HTML injection path anywhere |
| 10 | **A status the client doesn't know** (server adds one later) | Blank pill, or a crash on a lookup | Unknown status → neutral pill showing the raw string. Never blank, never throw |

---

## 15.1 — Sign in

**Sees.** Split panel: brand side, then email + password + Sign in + forgotten-password link.

**Can do.** Sign in · reach password reset.

**Cannot do.** Create an account — correct, the owner is provisioned by CLI and `/auth/register` always makes a customer. No self-service recovery beyond the reset link.

| What if | Answer |
|---|---|
| Wrong password | *"Email or password is incorrect"* — never say which was wrong |
| Right password, not the owner account | *"That account is not the workshop's"* — already correct |
| **API is down** | Today this likely throws unhandled. Distinguish *"Can't reach the shop — try again"* from a credential failure, with retry |
| Repeated failed attempts | Login has no visible rate limit (register does). **Flag:** add throttling server-side, or accept and document |
| Password manager / autofill | Keep `autocomplete="email"` and `"current-password"` |
| Caps lock | Show/hide password toggle rather than a caps warning |
| Submit twice | Button disables, label becomes *"Signing in…"* |

**Add.** Show/hide password · a real distinction between bad credentials and an unreachable server.

---

## 15.2 — Board · Today

**Sees.** Control strip (period · scope) → lead figure + sentence → queue tiles → refusal meter → 30-day tiles → visitors area → funnel.

**Can do.** Change period and scope · click any queue number into a filtered Orders view · open any KPI's explanation inline · switch to *What to make*.

**Cannot do (today).** Nothing on it links anywhere · no period control · no scope · four of five explanations unused.

| What if | Risk | Answer |
|---|---|---|
| **Brand-new shop — no orders, no visitors** | A wall of zeros and empty axes reads as *broken*, not as *new* | A real empty state: *"Nothing has happened yet. The first order shows up here."* If the catalog is also empty the lead sentence becomes the next step: *"Publish your first piece."* |
| Visitors but no orders | The funnel ends in a zero tail | Show it honestly — that tail *is* the finding |
| **Refusal on a tiny denominator** — 1 of 2 = 50% | The owner panics over noise | Below ~10 deliveries: no status colour, and the meter says *"too few deliveries to judge yet"* |
| Period selected with no data | Looks like a bug | Echo the chosen period in the empty state so the cause is obvious |
| Everything is fine | A blank lead line | The lead always says something true — fall back to revenue vs the previous period |
| Huge numbers (1 234 567 MAD) | Tile overflow | Compact formatting above a threshold, full value in the tooltip |
| Scope narrowed to one piece | Some blocks are meaningless at that scope (funnel is shop-wide) | Blocks that can't honour the scope grey out and say *"shop-wide"* rather than silently showing unscoped data |

**Add.** The strip · a linked queue · the refusal meter against its target · all five explanations · low-n suppression.

---

## 15.3 — Board · What to make

**Sees.** Evidence blocks (asked → waiting → searched → categories) → shelf (running out · dead stock) → seven-day forecast → best sellers.

**Can do.** Open the piece behind any row · start a new piece pre-filled from a search term that found nothing · change period.

**Cannot do (today).** **The screen does not exist.** `/admin/decide` has never been called.

| What if | Risk | Answer |
|---|---|---|
| **New shop — no requests, no searches, no signals** | Four empty boxes | Empty blocks collapse to one line each (*"No one has asked for anything yet"*) and the shelf leads, since it has content whenever pieces exist |
| **Nothing has sold yet** | Every forecast comes from category and attention only, all "low" confidence — and a confident-looking table of numbers invites over-trust | Say it **once at the top** — *"Nothing has sold yet, so these are estimates from attention, not sales"* — instead of 48 confidence badges |
| A piece with no category | The category-rate fallback has nothing to fall back to | Must not throw; that piece shows attention-only reasoning |
| `days_of_cover` is null (made-to-order, or zero rate) | An empty bar looks like zero days | No bar; render `—` with the reason on hover |
| **Every forecast range is [0,1]** | A dot plot of identical whiskers says nothing | Detect the degenerate case and fall back to a plain list |
| Long piece titles in the chart | Axis collision | Truncate at the axis, full title in the tooltip |
| Garbage or abusive search terms | It's raw visitor input on the owner's screen | Escaped and clamped; it is data, not markup |
| Near-duplicate searches (*lamp*, *lamps*, *lamp&nbsp;*) | The list looks noisy | Backend lowercases only. Accept, and note that merging is a future improvement |
| A 500-character "asked us to make" | Blows the block open | Clamp to two lines with expand |

**Add.** The whole screen · `GET /admin/waiting` · the runway and range charts · "start a piece from this search".

---

## 15.4 — Orders · list and drawer

**Sees.** Strip (period · status · search) → table: age, reference, customer, city, total, status, row actions → Load more.

**Can do.** Filter, search, sort · call · WhatsApp · open the drawer · move status · page through.

**Cannot do (today).** See the age (no date is rendered at all) · see the phone without expanding · sort · deep-link · act without scrolling past the item list.

| What if | Risk | Answer |
|---|---|---|
| **1,000 orders** | First paint blocks | 30 per page, "Load more", first page cached for instant return |
| Search on every keystroke | Each one walks a large table server-side | 350ms debounce; cancel in-flight requests |
| Search matches nothing | Dead end | Empty state that offers to clear the filter |
| **A move the server rejects** (stale tab) | Owner thinks the app is broken | Refetch the record, redraw legal moves, name what actually happened |
| **A move that is terminal or notifies** — delivered, cancelled, failed | One wrong tap sends a false *"your order was delivered"* and cannot be undone | Confirm step that names the consequence: *"This tells Amina her order was delivered."* Forward, non-terminal moves stay one tap |
| Offline when moving | The row shows a status the server never accepted | Pessimistic only; on failure the row is untouched and the error is on the button |
| `whatsapp_url` missing | A dead link | Hide the button |
| Malformed phone | — | Still render `tel:`; don't validate the owner out of calling |
| An order with zero items | Rare data problem | Render the shell, say *"no items recorded"*, never crash |
| Item image 404s | Broken-image icon in a pick list | Fixed aspect box with a placeholder |
| Drawer open while filters change underneath | The record vanishes from the list | The drawer stays pinned to its record even if it leaves the filtered set |
| Back button with the drawer open | Leaves the page entirely | URL holds `?open=REF`; back closes the drawer only |
| Very long address notes | Buried | Notes get real contrast — today they're the lowest-contrast text on the card, on a business where the note is how the courier finds the door |

**Add.** Age · phone on the row · sorting · the drawer with actions on top and item photos · confirms on notifying moves.

---

## 15.5 — Orders · Commissions

**Sees.** List, then a drawer with reference photos, customer identity, description, quote form, lifecycle actions.

**Can do.** Quote (price + lead time + note) · decline · advance the lifecycle · WhatsApp.

**Cannot do (today).** See the photos, name, phone, email, city or age · move past `quoted` — `moveRequest` is only ever called with `"declined"`, so you can filter to *In production* and no button reaches it.

| What if | Risk | Answer |
|---|---|---|
| **No reference photos sent** | An empty gallery reads as a loading failure | *"No photos sent"* |
| A photo is broken or enormous | Layout collapse, slow drawer | Lazy-load into fixed aspect boxes with a fallback |
| **Re-quoting something already quoted** | Server allows it — and it sends the customer a second price | Confirm: *"This sends Amina a new price, replacing the old one."* |
| Price ≤ 0, or lead time outside 1–365 | Server rejects after a round trip | Mirror the server's bounds client-side, error beside the field |
| **Declining** | Ends a lead, and `declined` has no way back | Confirm, and say what it sends |
| Budget is null | *"undefined MAD"* | *"No budget given"* |
| Arabic description | Mangled bidi | `dir="auto"` |
| Approved and converted | The link to the resulting order is dropped today | Show `order_reference` as a link into Orders |
| Two commissions from one person | Not linked | Group by phone in the drawer's identity block |

**Add.** Photos · identity · age · the full lifecycle · confirms on the two irreversible actions.

---

## 15.6 — Orders · Messages

**Sees.** Contact-form messages, unread marked, newest first.

**Can do.** Mark read · email · call.

**Cannot do.** Reply in the console · delete · archive · filter to unread.

| What if | Risk | Answer |
|---|---|---|
| **Spam arrives steadily** | With no delete or archive the inbox fills forever and the unread badge becomes meaningless | **Backend addition:** an archive flag (soft), plus an unread-only filter. Without it this screen degrades permanently |
| Neither email nor phone given | Nothing to act on | Say so on the row rather than showing empty contact chips |
| A very long message | Wall of text | Clamp with expand |
| Marking read twice / two tabs | — | Server is idempotent; safe |
| Unread count | Today it only populates *after* you open the tab it exists to advertise | Count comes from `/admin/today`, so the badge is right before you ever open the section |

**Add.** Unread filter · archive (backend) · working `mailto:` / `tel:` — they are inert text today.

---

## 15.7 — Manage · Pieces (list + inspector)

**Sees.** Strip (category · status · search · New piece) → list with photo, title, category, price, status, stock, attention mark → inspector on the right.

**Can do.** Filter, search · edit every field EN and AR · manage photos (upload, cover, alt text, remove) · variants · batch · publish, pause, archive, restore · open the public page.

**Cannot do (today).** See a piece's category without opening it · read the Arabic story without opening an edit form four levels down · see per-variant stock correctly · edit a variant or a photo's alt text at all.

| What if | Risk | Answer |
|---|---|---|
| **`available` is null** | The list literally prints `"null on the shelf"` today | Guard every render; made-to-order shows its lead time instead |
| Piece has no photo | Publishing fails server-side after the attempt | Show the blocker **before** the click — the Publish button is disabled with *"needs a real photo first"* |
| Shelf piece at zero, or workshop piece with no lead time | Same class of late failure | Same treatment: reason shown up front, in the list as an attention mark |
| **Deleting the last photo of a live piece** | Server refuses | Disable with the reason rather than explaining after |
| **Removing a piece from a batch** | It **renumbers the whole run** — `04/12` becomes `04/11` — and the owner may not know | Say it at the point of action: *"Removing this renumbers the run."* |
| **Adding pieces to a batch** | It **notifies everyone waiting**, irreversibly. One accidental `+1` messages 30 people | Show the waiting count on the control itself — *"3 people are waiting; adding will tell them"* — and confirm whenever it is above zero |
| **Per-variant stock** | The list response always returns `available: 0` for variants; only a single-piece fetch is correct | The inspector always fetches the single piece. Never render variant stock from a list payload |
| Duplicate SKU | Server 409 | Error beside the field, not a toast |
| **Retiring a variant** | Today it is instant and destructive, while photos and categories both arm first — inconsistent, and a mis-tap is permanent | Confirm, matching the other destructive actions |
| Archiving | Reversible (restore as draft), keeps order history | Confirm, and say it stays in history |
| Editing in two tabs | Product PATCH is partial, so last-write-wins on changed fields only — tolerable | Refetch on focus; no locking |
| **Arabic fields** | Bidi mangling | `dir="rtl"` on `*_ar` inputs, `dir="auto"` on display |
| Changing price with open orders | Owner fears retroactive change | Orders snapshot their price — say it once, in place |
| Uploading a 15MB file or a PDF | Fails after a long upload | Pre-check size and type client-side and refuse instantly with the limit named |
| Upload fails midway | The file selection is lost | Keep the pick, offer retry |
| Titles of 300 characters | Layout | Truncate with the full value on hover |

**Add.** Category on the row · readable AR · alt-text editing · variant editing · correct variant stock · attention marks · confirms where they're missing and none where they aren't needed.

### 15.7b — New piece (the flow you called out)

| What if | Risk | Answer |
|---|---|---|
| **Only English filled, Arabic left empty** | Allowed by the server — but an Arabic visitor then sees an English title on the storefront. A silent quality hole | Don't block. Create it, then mark the piece *"missing Arabic"* in the list until filled |
| **Arabic typed into the English field** | Nobody notices until the shop looks wrong | Detect the script and warn inline: *"This looks like Arabic — did you mean the Arabic field?"* Warn, never block |
| **Kind switched from Workshop to Shelf after entering a lead time** | Server rejects: *"a piece already made has no lead time"* | Switching kind clears the fields that no longer apply, visibly |
| Price left at 0 or blank | Late server rejection | Client mirrors `> 0` with the message beside the field |
| **Created, then abandoned before a photo** | A draft with no photo sits forever, invisible | The attention mark plus a *"finish this"* line keeps it visible |
| Inline "+ new category" with a name that already exists | Two categories with near-identical slugs | Check existing names as they type and offer the match instead |
| **Piece created but the photo upload fails** | The owner may think nothing was created and make a second one | Never lose the created piece — land in its inspector with the upload error shown there |
| Double submit | Two identical drafts | Disabled button on submit |
| Description longer than the server allows | Late rejection | Mirror the cap with a live counter |

---

## 15.8 — Manage · Categories

**Sees.** The tree — roots and their children — with icon, EN/AR names, order, active state.

**Can do.** Create, rename, reorder, set/remove icon, activate/deactivate, delete.

**Cannot do.** Nest deeper than two levels (by design) · reorder by dragging.

| What if | Risk | Answer |
|---|---|---|
| **Deleting a category that has children or products** | Server 409 after the click | Disable delete with the reason — *"3 pieces use this"* — before the click |
| **A partial PATCH** | `CategoryWrite` is a **full replace**: any omitted field is nulled. A careless partial update wipes the Arabic name | Always send the complete row. Today's `withoutMeta` does this correctly — keep it and comment why |
| **Reorder half-fails** — first swap saved, second rejected | Order is now inconsistent and the screen doesn't know | Refetch on error and show what happened. Today `move()` has **no error handling at all** — a failed reorder silently does nothing |
| Category with no icon | The storefront's rail renders a gap | Attention mark in the list |
| Trying to nest a child under a child | Unsupported shape reaches the server | The parent picker only offers roots |
| Arabic names | Bidi | RTL inputs |
| Deactivating a category with live pieces | Those pieces vanish from the storefront's filter | Say how many pieces are affected in the confirm |

---

## 15.9 — Manage · Customers

**Sees.** Everyone who has ordered — account or guest — with spend, order count, refusals, and their orders on open.

**Can do.** Search · open · deactivate/reactivate an **account**.

**Cannot do.** See registered users who have never ordered (the list is built from orders) · email them · export.

| What if | Risk | Answer |
|---|---|---|
| **A guest's `id` is a phone string, not a UUID** | `PATCH /customers/{id}/active` sends a phone into a UUID column and **errors** | Gate the control on `has_account`; and fix the server to fail cleanly rather than 500 |
| Deactivating an account | They can no longer sign in — but they can still buy as a guest | Confirm, and say exactly that, so the owner isn't surprised |
| **Search performance** | Every keystroke walks the whole orders table in Python | Debounce to 500ms; note the aggregate rewrite as known future work |
| `time_on_site_seconds` is null for guests | Reads as "0 seconds" | `—` with a one-line reason |
| Two people share a phone | They merge into one customer | Accept; document it in place rather than pretending otherwise |
| A customer with 200 orders | Long drawer | Page the order list inside the drawer |
| Stale rows while typing | Today the list isn't cleared before refetch, so you read the previous query's results | Clear or dim on query change |

---

## 15.10 — Manage · Feed

**Sees.** Six levers with their plain-language sentence · the live top of the feed · per-piece boost · embedding coverage.

**Can do.** Tune levers (0–5) · boost or bury a piece · refresh embeddings.

**Cannot do (today).** Any of it — the endpoints exist and nothing calls them.

| What if | Risk | Answer |
|---|---|---|
| **Every change is live to real shoppers** | The owner experiments and quietly degrades the shop | Levers **apply on Save, not on drag**; dirty state is obvious; *Reset to defaults* is always one click |
| All six set to zero | Ranking becomes arbitrary | Warn before saving |
| **Fatigue is subtracted, not added** | Raising a slider makes items *less* likely — an inverted mental model | Label by effect, not by name: *"how hard we push down something they've already seen"* — the backend copy already says this; use it verbatim |
| **The preview is personalised** | It would show *the owner's* feed, not a typical shopper's — a completely misleading preview | Preview must be computed for a **fresh visitor with no history**, and labelled as such |
| Embeddings refresh on a large catalog | Long, blocking, looks hung | Report counts, run without blocking the page, show coverage as a meter |
| Boost across hundreds of pieces | The search list stops scaling | Paged search; fine at today's 48 |
| Owner forgets what they changed | Cannot get back to sane | Show the previous value beside the new one until saved, plus the last-changed stamp |

---

## 15.11 — Assistant

**Sees.** Conversation, suggestions, composer, and which tools ran.

**Can do.** Ask · start a new conversation · carry the current screen as context.

**Cannot do.** Stream · stop mid-answer · copy an answer · retry a failed turn.

| What if | Risk | Answer |
|---|---|---|
| **No `LLM_API_KEY` configured** | Today a fabricated assistant message is written into history **and replayed to the server as real context on the next turn** — the model is told it said something it never said | Failures render as a UI notice outside the transcript. History only ever holds real turns |
| The answer contradicts the dashboard | Trust in both collapses | Both read the same metrics module; surfacing `trace` makes it checkable |
| The owner asks in Arabic | Reply is Arabic in an LTR bubble | `dir="auto"` on every bubble |
| Very long answer | Clipped | Bubble scrolls; nothing is truncated silently |
| `sessionStorage` full or private mode | History silently fails to persist | Catch and continue in memory |
| Network dies mid-answer | A half-turn in history | Error outside the transcript; history untouched |
| Long conversation | Each turn resends up to 16 turns — cost and latency grow | Show that older turns drop out of context |

---

## 15.12 — What this diagnostic changes in the build

Five things surfaced here that were not in the earlier plan and are now part of it:

1. **Unsaved-work rescue** on session expiry — the single worst silent failure in the console.
2. **Confirms sized to consequence** — required on anything that notifies a customer or cannot be undone; explicitly *not* required on reversible, forward actions. Today it is the reverse: photo removal arms itself, while retiring a variant is instant.
3. **Blockers shown before the click**, not explained after — publishing without a photo, deleting the last photo, deleting a category in use.
4. **Low-n suppression** on the refusal rate, so a 1-of-2 sample never reads as a 50% catastrophe.
5. **A neutral-visitor feed preview** — a personalised preview would be actively misleading.

Plus two backend additions this pass revealed: **archiving contact messages**, and a **clean failure** on the customer-active endpoint for guests. That brings the backend total to **14 additive changes**.

---

# 16. Pre-implementation contracts — architecture freeze

A technical review raised seven blockers. I checked each against the code rather than taking them on faith. **Three are already satisfied**, **one exposed a real error in my own plan**, and the rest are genuine gaps now closed here. After this section the architecture is frozen.

## 16.1 — Authorization · already enforced, now stated

**Verified in code.** `require_owner` (`backend/app/deps.py:77`) raises **403 `"Workshop access only"`** when `user.role is not UserRole.owner`; `current_user` raises **401 `"Sign in to continue"`** without a valid bearer. All 40 owner endpoints already take the `Owner` dependency.

**The contract, binding on every new endpoint:**

> Every `/api/admin/*` route takes `Owner`. Authentication and authorization are enforced **server-side, per request**. Frontend routing, hidden buttons and disabled controls are **conveniences, never controls** — the API assumes every path is called directly by someone who read the JS bundle.

Nothing is protected by not being linked.

## 16.2 — Order state machine · verified, mirror is correct

Server truth (`backend/app/models/orders.py:40`), and the frontend's `NEXT_STATUSES` matches it exactly:

```
placed          → confirmed · cancelled
confirmed       → preparing · cancelled
preparing       → ready · cancelled
ready           → out_for_delivery · cancelled
out_for_delivery→ delivered · failed
failed          → returned · out_for_delivery      ← a second delivery attempt is legal
delivered       → ∅     cancelled → ∅     returned → ∅
```
All owner-triggered. The console offers exactly this set and never invents a move.

## 16.3 — Commission state machine · **my plan was wrong**

The review was right to force this. Server truth (`backend/app/models/requests.py:39`):

```
requested    → quoted · declined · withdrawn
quoted       → approved · withdrawn · quoted      ← self-loop: re-quoting is legal
approved     → in_production · withdrawn
in_production→ ready · withdrawn
ready        → delivered · withdrawn
delivered → ∅    declined → ∅    withdrawn → ∅
```

**Three corrections to what I wrote earlier:**

| I wrote | Actually |
|---|---|
| "the owner advances quoted → approved" | **Approval is the customer's action** — `service.py:143` sets it with `actor="customer"`. The console *shows* that the customer approved; it must not offer the button |
| "decline is available in the drawer" | **`declined` is reachable only from `requested`.** Once quoted, the way out is `withdrawn`, not `declined` |
| "cancelled" | Commissions have **no `cancelled`** — the escape hatch is **`withdrawn`**, and it is reachable from every live state |

**Owner-triggerable:** `requested→quoted` · `requested→declined` · `quoted→quoted` (re-quote) · `approved→in_production` · `in_production→ready` · `ready→delivered` · `*→withdrawn`.
**Customer-triggerable:** `quoted→approved`.

The drawer derives its buttons from this table, minus the customer's transition — the same way orders already work.

## 16.4 — Conversion idempotency

When an approved commission becomes an order, a second trigger must **return the existing order, never mint a second one**. `order_reference` on the request is the idempotency key: if it is set, the endpoint returns that order with `200`; it does not create. The console additionally disables the control once `order_reference` exists and links to it instead.

## 16.5 — Schemas for every new endpoint

| Endpoint | Request | Response | Errors | Side effects |
|---|---|---|---|---|
| `GET /admin/today` | `?date_from&date_to&category_id&product_id` | `{period, lead:{kind,value,sentence}, queue:{to_confirm,quotes_to_send,unread}, refusals:{…,worst_cities[]}, revenue:{collected,change,daily[{date,mad}]}, audience:{visitors,returning_pct,actions_per_visitor,daily[]}, funnel:{steps[]}}` | 401·403·422 | none (read) |
| `GET /admin/waiting` | `?limit=50` | `[{product_id,title,slug,waiting,oldest_at}]` | 401·403 | none |
| `GET /admin/feed/preview` | `?limit=20` | `{visitor:"neutral", items:[{product_id,title,score,terms:{affinity,semantic,popular,fresh,business,fatigue}}]}` | 401·403 | none |
| `PATCH /admin/media/{id}` | `{alt_en?,alt_ar?,is_process_footage?}` | `MediaResponse` | 401·403·404·422 | none |
| `PATCH /admin/variants/{id}` | `{option_en?,option_ar?,price?,display_order?,is_active?}` | `VariantOut` | 401·403·404·**409 dup SKU**·422 | none |
| `PATCH /admin/contact-messages/{id}` | `{archived:bool}` | `ContactMessageOut` | 401·403·404 | none |
| `PATCH /admin/customers/{id}/active` | `{active:bool}` | `{id,is_active}` | 401·403·**404 for a guest id**·422 | account can no longer sign in |
| `PUT /admin/feed/weights` | `[{key,value}]` **all six** | `[WeightOut]` + `updated_at` | 401·403·400 unknown key·422 | **changes the live storefront** |
| `GET/PATCH` others | — | existing shapes plus `actor` on events, `category_id`+`source` on requests, `?limit=` on analytics | — | — |

**Every mutating endpoint that messages a customer is marked as such in its response** (`notified: true|false`) so the console can tell the owner what actually went out.

## 16.6 — Feed: atomicity and boost semantics

**Atomic — already true.** `PUT /admin/feed/weights` mutates all rows then calls a single `db.commit()`. All six save or none do. The contract now states it, and the console always sends the full set of six, never a partial.

**Boost semantics — correcting my own wording.** `business_boost` is `ge=0, le=5` and enters the ranking as `w_business × business_boost`. So:

- The range is **0–5, never negative.** There is **no "bury"** — I wrote "boost or bury" and that was wrong. `0` is *no push*, not suppression.
- It is **additive-weighted**, not a multiplier on the final score and not an override.
- Its real strength depends on the `business` lever, so the UI shows both together: *"boost 3 × lever 0.5"*.

## 16.7 — Pagination · switching to keyset

**Verified:** orders and requests page by `offset`/`size` ordered `created_at DESC`. On an active queue that drifts — an order arriving between page 1 and page 2 pushes a row down and you see it twice.

Adopting **keyset (cursor) pagination** on the two live queues: `?cursor=<created_at,id>&limit=30`, ordered on the same stable pair. Catalog, customers and categories keep offset — they don't churn while you read them. This adds a 15th backend change.

## 16.8 — Cache invalidation map

The cache is not useful without this. Every mutation names what it invalidates:

| Mutation | Invalidates |
|---|---|
| Move order status | `orders` · `today` · that order · the customer · linked commission |
| Send / re-send quote | `commissions` · `today` · that commission |
| Advance or withdraw a commission | `commissions` · `today` · that commission · `orders` if converted |
| Mark message read / archived | `messages` · `today` |
| Create / edit / publish / archive a piece | `pieces` · that piece · `today` if it changes shelf state · `make` |
| Add or remove batch pieces | that piece · `pieces` · `make` · `waiting` |
| Photo or variant change | that piece only |
| Category create / edit / reorder / delete | `categories` · `pieces` (category names on rows) |
| Save feed weights or a boost | `feed` · `feed/preview` |
| Deactivate a customer | that customer · `customers` |

Rule: **a mutation refreshes what the owner can see right now, synchronously; everything else is marked stale and refetched on next view.** Confirm an order and the Board's queue count is right when you get back to it.

## 16.9 — Assistant tool permissions · read-only by construction

**Verified:** all 13 copilot tools read from `metrics`/`analytics`/`forecast`. `Answer.actions` exists in the schema and **nothing ever populates it** — there is no write path today.

The rule, so this stays true:

> Copilot tools are **read-only by default**. Any future tool that mutates must be declared `mutating: true`, must never execute inside the model's turn, and must surface as an explicit confirmation the owner presses. *"Cancel Amina's order"* is a sentence, not an instruction.

Also adding **retry** (a failed turn is a UI error with a Retry that issues a *new* request; only a successful reply ever enters history) — the fabricated-turn bug already forced history to hold real turns only.

## 16.10 — File uploads · mostly already safe

The review assumed less than the code does. **Verified in `catalog/routes.py:586`:** the server reads the bytes first and **ignores the declared Content-Type entirely** (*"whatever the client typed and is never used"*), sniffs the real type, rejects anything that isn't JPEG/PNG/WebP with **415**, caps at 12MB with **413**, and generates the storage path itself (`products/{id}/{uuid}`), so there is no traversal and **SVG is already excluded** — closing the malicious-SVG case.

Two real gaps remain, and are added:
- **Pixel-dimension cap** — a 12MB file can still decode to a 30,000×30,000 bomb. Reject above a sane bound before decoding.
- **Client-side pre-check** — size and type refused instantly, so a 12MB upload doesn't fail after the wait. A convenience on top of the server check, never instead of it.

## 16.11 — Customer identity · not silently merged

The review is right that I was too casual. Today `coalesce(customer_id, customer_phone)` genuinely merges two people who share a phone — common in a family.

**Contract:** account is the strongest identity; the guest order is the next; **phone is a contact attribute and a matching *signal*, never an identity on its own.** Where a phone maps to more than one identity the console says so — *"2 records use this number"* — instead of presenting a single merged history as fact.

## 16.12 — Unsaved-work rescue · privacy bounds

The stash is useful and it holds customer data, so it is bounded:

- **Store:** only the unsaved form fields needed to restore the draft, keyed by record.
- **Never store:** passwords, tokens, uploaded binary, or any customer field the form was not editing.
- **Clear** on successful save, on explicit discard, and on sign-out.
- `sessionStorage` only — it dies with the tab, same lifetime as the session token.

## 16.13 — Dirty-form guard

The drawer/inspector architecture makes accidental dismissal easy. Any dirty form intercepts: closing the drawer, selecting another record, switching section, and browser navigation — *"Unsaved changes — Leave or Stay."* Clean forms never prompt.

## 16.14 — Business events are not an audit log

I said "no audit log" while also asking for `actor` on the timeline. Making the distinction explicit so nobody later deletes the events as scope creep:

> **Order and request events are part of the domain model, not an audit system.** Each carries entity, event type, actor, timestamp and note, and they already exist and are already written. Surfacing `actor` exposes what is stored. What remains out of scope is a *generic* audit log over every table and field.

## 16.15 — Chart tokens

One token set, so no chart invents its own colour:

```
chart.nominal            one hue, every bar in a nominal set
chart.sequential.1..5    magnitude, light → dark
chart.ordinal.1..6       ordered categories (the funnel)
chart.axis / chart.grid  recessive hairlines
status.good / warning / serious / critical   reserved, never a series
```
The validator runs against **these tokens**, in light and dark, not against per-component values.

## 16.16 — Seed data is development-only

Realistic seed data and "no mock data in the product" are not in conflict, but the boundary must be enforced:

- Lives in a CLI command, **never** in application startup or an entrypoint.
- **Refuses to run when `ENVIRONMENT=production`.**
- Idempotent, and everything it creates is identifiable so it can be removed wholesale.
- The production database never receives a fake order.

## 16.17 — Verification wording

*"Zero failed requests"* was wrong — negative tests are supposed to fail. Restated:

> **Zero *unexpected* failed requests on the happy path.** Separately, every deliberate failure — 401 expired, 403 wrong role, 404 missing, 409 duplicate SKU, 413 oversize, 415 wrong type, 422 invalid — must produce its specified UI behaviour, and each is an explicit test case rather than an error to be eliminated.

## 16.18 — Public-page link by status

| Status | Link |
|---|---|
| `active` | opens the live page |
| `draft` / `paused` | disabled, with the reason |
| `archived` | no link — it is gone from the shop |

---

**Backend total is now 15 additive changes** (adding keyset pagination). The architecture is frozen at this point; anything further is a change request, not a revision.
