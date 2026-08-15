# M-StyLe

A single-vendor Moroccan 3D-printing shop. FastAPI + Postgres + Redis + MinIO
on the backend, one Next.js 15 App Router frontend serving both the storefront
(`/[lang]`) and the owner's console (`/admin`).

See [`docs/DECISIONS.md`](docs/DECISIONS.md) for the business rules and open
decisions, and [`docs/BRAND.md`](docs/BRAND.md) for the positioning behind them.

## Run it

```sh
cp .env.example .env   # fill in real values — see the comments in the file
docker compose --profile dev up
```

This starts Postgres, Redis, MinIO, Mailpit (catches outgoing email locally),
the API and the web app. Migrations run automatically on API startup
(`backend/entrypoint.sh`) — never run `alembic revision --autogenerate`; every
migration in this project is hand-written.

Create the first owner account:

```sh
docker compose exec api python -m app.cli seed-owner owner@example.ma 'a real password' 'Full Name'
```

Then sign in at `/admin`.

## Run on your LAN

The frontend listens on `0.0.0.0` for both `npm run dev` and production-style
local runs, so other devices on the same network can open it. Use your
machine's LAN IP in the browser, for example:

- `http://192.168.1.20:3000` for `npm run dev` or `npm run start`
- `http://192.168.1.20:80` if you are serving through the production nginx stack

If the page still does not load from another device, check the host firewall
and confirm the machine's IP has not changed.

## Production deploy

```sh
./deploy.sh
```

Builds and starts the full stack behind nginx with TLS via certbot. Requires
`APP_URL`, `JWT_SECRET` and `MEDIA_HOSTNAMES` set in `.env` first — the script
refuses to run without them. See the script's own comments for the deploy
order and why it matters (the storefront's static pages are built against a
live API).

## Tests

```sh
# Backend — needs a throwaway Postgres reachable at TEST_DATABASE_URL
cd backend && pytest

# Frontend
cd frontend && npm run type-check && npm run lint && npm test
```

## Codebase criticism report

Read-only audit across the whole stack: 27 customer-facing pages, the full
admin console, and all 12 backend modules. Goal was not bugs — it's
**decisions that are dumb even though the code works**. Findings below,
worst first.

### Hall of shame — the five worst calls

**1. The admin console's home page renders nothing.**
`frontend/src/app/admin/page.tsx` — "Board", the first nav item, the first
thing the owner sees after logging in — is this, in full:

```tsx
/**
 * Board — pending rebuild.
 * ... renders them once `/api/admin/today`'s response shape is verified
 * against the schema changes in progress (docs/DECISIONS.md).
 */
export default function Board() { return null; }
```

The backend computes `pulse`/`revenue`/`refusals`/`conversion` for exactly
this screen. The API client has the calls wired. Nothing renders them. The
owner's front door is a blank page with a code comment where a dashboard
should be. `/admin/make` (a *deeper* nav item) ended up absorbing all the
real decision-support UI, so the actual landing page works — it's just not
the landing page.

**2. Personal email addresses hardcoded into backend source.**
`backend/app/modules/security/service.py:25-27`:

```python
ALERT_RECIPIENTS = ("yassinsinif4@gmail.com", "Yassine.Sinif@emsi-edu.ma")
# Fixed addresses, not configuration — the owner asked for these two specifically.
```

A personal Gmail account and what looks like a university address, committed
to version control, undeployable to change without a code push — in a
codebase that already has a working `ShopSettings` DB-row pattern used for
exactly this class of value everywhere else (see the contact-info migration
in commit `617d3b7`). This is the one item on this list that isn't just
"dumb," it's a PII-in-git problem.

**3. Login is required for the one action that isn't buying anything.**
`Chrome.tsx` states the site's own philosophy outright: **"Buying never
needs an account; talking to the assistant does."** Cart, checkout, order
tracking, and custom-request tracking are all deliberately account-free.
The one thing gated behind sign-in is asking the chat assistant a wording
question on `/contact` — the lowest-stakes, zero-commitment interaction on
the entire site. This is the exact inverse of every other access decision
made in the codebase.

**4. Four unconnected "someone is trying to reach us" systems.**
Contact form, `/ask` custom-request intake, piece back-in-stock alerts, and
the AI assistant's WhatsApp escalation are four completely separate lead
pathways — different storage models, different status vocabularies
(`archived_at`/`read_at` vs `hidden_at`+enum vs `notified_at` vs nothing),
different admin screens, zero cross-linking. Meanwhile `admin/customers.py`
goes to real effort (fingerprint bucketing, `visitor_id` joins) to unify a
guest's *order* history — that unification effort was never extended to any
of the four ways a lead actually reaches the shop. A customer who messages
via contact, then asks the AI for a custom item, then joins a waitlist looks
like three strangers to the owner.

**5. `requests` is a hand-copied parallel of `orders`.**
Custom-order intake (`requests` module) reimplements almost the entire
`orders` state machine from scratch: its own status enum, its own event log,
its own hide/unhide, its own tracking-token+phone lookup, its own
notification-copy table — instead of a quote being a *stage* of one order
lifecycle. The approval step literally hand-copies fields
(`customer_name`, `customer_phone`, `customer_email`, `lang`) from the quote
into a freshly constructed `Order` rather than sharing any base. `requests`
even imports `delivery_fee_for` directly from `orders.service`, which is the
tell that these were always one concept split into two skeletons.

### Backend — everything else worth naming

- **Rate limits have no visible policy.** Checkout — the single highest-value,
  most abuse-sensitive action in the shop — gets a *looser* limit
  (10/10 min) than the contact form (6/10 min). Order/request lookup
  (brute-forceable by reference) gets 15/10 min with no per-account
  secondary layer, unlike login/reset which do have one. Nobody explains why.
- **Two independent "block this person" mechanisms.** `admin/customers.py`'s
  block flow and `security`'s block endpoint both create `Blocklist` rows
  through separate code paths with separate scopes (customer id vs
  IP/fingerprint). Neither is aware of the other.
- **A core ranking signal was dead code.** Product embeddings — weighted 0.8
  in the feed-ranking formula — had no code path that ever wrote them. "The
  column existed, the index existed, the term was in the SQL, and it was
  multiplied by zero for every piece in the shop." Nobody caught this until
  someone went looking.
- **A shipped false alarm.** A now-deleted `shelf_state()` function reported
  every in-stock product as `available = 0`, and the dashboard led with "47
  pieces are running out" over a catalogue that was completely fine. The
  tombstone comment is still in the code as a warning to future readers.
- **`catalog/routes.py` is 985 lines covering six unrelated concerns**
  (taxonomy, product CRUD, variant CRUD, attribute CRUD, physical-inventory
  tracking, social interactions, waitlists) while `settings` is 17 lines and
  `local` is 88. Module size in this codebase tracks nothing about actual
  domain complexity.
- **Two AI system prompts, each a hand-written English essay embedded as a
  Python string constant**, duplicating brand-voice rules that are also
  cited by section number ("BRAND.md §6", "§8", "§9", "§10") across four
  other modules as if it were a legal document — except nothing ever reads
  BRAND.md at runtime. An update to a single brand rule requires hand-editing
  at least five files with no shared source of truth, in a codebase that
  otherwise nails "one source of truth" for its numeric KPIs.
- **The AI shopper's `track_order` tool reimplements order lookup a third
  time** instead of calling the existing `orders.routes.find_order` /
  `requests.routes.track_request` functions it's duplicating.
- **Permanent dead API surface kept for a migration that should have
  expired**: every product/variant schema still returns `available: None`
  "so an old cart written by a previous tab still loads without a shrug" —
  a workaround for shelf-stock tracking that was removed entirely, left as a
  permanent field on every response instead of a scoped, time-boxed shim.

### Admin console — everything else worth naming

- **Three near-identical "queue" pages that never got unified.** Orders,
  Commissions (custom requests), and Messages each hand-copy their own
  `PAGES` nav array verbatim, each invent their own filter/archive/status
  wiring from scratch, and each track "a customer wants something" through
  a different status vocabulary. An owner has to learn three vocabularies
  for one mental concept.
- **Two-popup product creation.** "Add" opens a 3-tier category picker
  that only ever leads to a second, separate "New piece" popup — which has
  its own, partially redundant category picker inside it. One task, two
  stacked dialogs.
- **Three separate popups for one customer** (`CustomerPopup`,
  `CustomerAnalyticsPopup`, `BlockPopup`), each independently fetching data
  about the same person instead of one popup with sections.
- **`blocklist()` and `removeBlock()` are wired in the API client and called
  by nothing.** Once created from the Logs page, a block is permanent and
  invisible — there is no screen anywhere to view or lift one.
- **Raw ML tuning knobs handed to a non-technical single owner.** The Feed
  page exposes six ranking-algorithm coefficients (affinity, semantic,
  popularity, freshness, business, fatigue — 0 to 5, one decimal place)
  directly, complete with a confirmation dialog for "turn every lever off?"
  because that's an easy way to zero out the whole recommendation engine.
  This reads like a feature that was interesting to build, not one an owner
  asked for.
- **"Settings" is two fields** (shop email, phone) while the far more
  consequential settings — the Feed sliders above — live under a completely
  different nav door, with no signposting that this split is deliberate.
- **The Assistant is a 5th top-level nav door** that mostly re-answers
  questions `/admin/make` already answers with dedicated, better UI (ranked
  evidence, forecast, confidence badges) — "What should I make next?" is a
  suggested prompt in the chat, right next to a purpose-built page that
  answers exactly that, two doors over. It's also silently non-functional
  if `LLM_API_KEY` isn't configured, with no indication of that anywhere
  in the UI — the door is always shown regardless.
- **Confirmed remnants of the pre-rebuild console, still shipping**:
  `/admin/manage/categories` is a redirect tombstone; the `Drawer` overlay
  component is exported and unused, fully superseded by `Popup`; category
  icon upload endpoints exist with no UI that ever calls them.

### Customer-facing pages — everything else worth naming

- **Two HTTP clients, one of them undocumented.** `lib/api.ts` opens with
  "One place that talks to the API" — every request carries language and
  visitor fingerprint, and a `403 blocked` response triggers a global
  `BlockedScreen`. Auth and profile screens skip all of it: login, register,
  profile save, avatar upload, and order history on the profile page all
  use raw `fetch()` calls that carry none of that. A blocked visitor
  checking their own profile just silently fails instead of seeing the
  block screen — on the single most sensitive traffic in the app.
- **"The shop states no time to anyone" — except constantly.** Two separate
  comments proudly document removing all making-time promises as policy.
  Meanwhile delivery-day ranges are printed everywhere: city autocomplete
  badges, checkout estimates, a whole delivery FAQ section. The
  distinction the code is drawing (no *making*-time claims, delivery-time
  claims are fine) is reasonable, but the comments overstate it, and one
  stale comment in `PieceView.tsx` claims a workshop piece "still says how
  long the making takes" — no such text exists anywhere in the component.
- **`request/[token]` vs `track/[token]`: same problem, solved twice,
  differently.** Both are "look up my thing by a token" pages with
  equivalent staged status enums. `track/[token]` gets a full visual
  progress timeline. `request/[token]` — arguably the higher-stakes page,
  since it involves a price and, per policy, a 30% deposit — gets a plain
  text status label and no timeline at all.
- **The one form that involves committing real money skips the shared
  city-autocomplete component.** Every other city input in the app
  (signup, profile, `/ask`, checkout) uses `CityAutocomplete` with live
  delivery-day badges. The quote-approval form on `request/[token]` uses a
  bare `<input>`.
- **Three different "how do we reach you" validation policies**, one per
  form, none shared: checkout requires phone only; `/ask` requires phone
  *and* email; the contact form requires either. Nobody wrote down why
  these differ.
- **`/contact` and `/ask` both claim to be "how you request something
  custom," and neither says so.** `/ask` is the real pipeline (category,
  photos, quote, tracking token). `/contact`'s message form looks the same
  to a shopper but produces none of that — no reference number, no quote
  flow — and its own copy tells someone wanting a real request to "use the
  form above," meaning itself, not `/ask`.
- **A one-edit-point abstraction with two edit points.** `private-layout.tsx`
  exists explicitly "so a change of mind about `nocache`/`nosnippet` happens
  in one place rather than four," and documents its four callers. A fifth
  page, `account/layout.tsx`, needs the identical metadata and hand-rolls
  it instead of calling the shared helper.
- **The password-reset page for the owner's own admin login is a public
  storefront route**, distinguished from an ordinary customer reset by
  nothing in the URL — a side effect of "it used to point straight at
  `/admin`, which is a dead end for anyone but the owner," never revisited.
- **Two unrelated magic `20`s in the same file.** `PieceView.tsx` hardcodes
  a quantity cap of 20 and a personalization-name character cap of 20,
  three lines apart, unrelated to each other, both magic numbers — in a
  codebase whose own commit history is about killing exactly this pattern
  (the old hardcoded `DELIVERY_FEE = 30`).
- **Identical URL-state filter logic, written twice.** `CategoryRail`
  (desktop) and `ProductFeed` (mobile chips) each independently reimplement
  "read `?category=`, build a new `URLSearchParams`, set-or-delete,
  `router.replace`" for the same feature.
- **No self-service recovery for a lost request token.** `/orders` exists
  specifically because losing an order reference used to mean losing the
  order. A lost custom-request token — higher stakes, involves a price
  negotiation and a deposit — has no equivalent recovery page, only a
  WhatsApp link buried inside the page you can no longer reach.

### The pattern underneath all of it

Individually most of these are small. Together they say the same thing
three times: **this codebase gets rebuilt in pieces, and the old piece is
never fully removed or the new piece never fully finished before attention
moves elsewhere.** The admin console was rebuilt and its landing page never
got the second half. Requests was clearly meant to become a stage of orders
and instead became its own copy. The "one HTTP client" rule was written down
correctly and then not applied to the parts of the app (auth, profile) that
came from a different sprint. Comments in this repo are unusually honest
about past mistakes — nearly every module has one admitting a bug it used
to have — which is a genuine strength, but it also means the codebase is
telling on itself: it knows where its half-finished migrations are, and
they're still there.



