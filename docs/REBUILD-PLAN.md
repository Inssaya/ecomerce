# MoStyle — Rebuild Plan (v2)

**Status:** Planning. No code written yet against this plan.
**Supersedes:** the multi-store / microservices architecture in the current `main`.
**Read with:** [`BRAND.md`](./BRAND.md) — positioning and why any of this matters commercially.

> We are a **workshop**, not a shop. Two offers, and they map straight onto the architecture:
> **The Shelf** (pieces already made — finite, real photos, piece-numbered) and
> **The Workshop** (made to order — the `request_custom_item` flow in §5).
> The feed engine in §3 is the workshop's **demand sensor**: it decides what we make next.

---

## 1. What is wrong today

| Problem | Consequence |
|---|---|
| 8 microservices + gateway + RabbitMQ + Meilisearch for a **single-owner shop** | Enormous ops cost, no benefit. Cross-service joins are HTTP calls. No foreign keys. |
| 4 disconnected storefronts (clothes / 3dprint / electronics / glasses) | Brand is fragmented. Nothing relates to anything. |
| Store dumps every product at once | Choice paralysis → confusion → no purchase |
| Harsh black + orange theme | Cold. Does not feel like somewhere you want to linger. |
| No real personalization | Every visitor sees the identical wall of items |
| No taxonomy depth | Cannot express "T-Shirts → Oversize" |

**The central error:** we tried to solve confusion with *static separation* (subdomains). The correct solution is *dynamic narrowing* — the store reshapes itself around each visitor.

---

## 2. Target architecture

**One monolith. One database.**

```
┌──────────────────────────────────────────────┐
│  Next.js 14  (SSR storefront + admin)        │
└───────────────────┬──────────────────────────┘
                    │  /api/*
┌───────────────────▼──────────────────────────┐
│  FastAPI monolith                            │
│  modules: catalog · feed · orders · ai ·     │
│           notify · admin · auth              │
└───────────────────┬──────────────────────────┘
                    │
     PostgreSQL 16 + pgvector  ·  Redis  ·  MinIO
```

### Container count: 16 → 6

| Keep | Drop | Why dropped |
|---|---|---|
| PostgreSQL (+pgvector) | RabbitMQ | Redis + arq covers our job needs |
| Redis | Meilisearch | Postgres FTS + pgvector hybrid is enough and removes a service |
| MinIO | Gateway | Monolith has no services to route between |
| FastAPI (one app) | 8 services | Merged into modules |
| Next.js | — | |
| nginx | — | |

### What is salvaged, not rewritten

Most existing Python **ports directly** — it becomes a module merge, not a rewrite:

- SQLAlchemy models → one `app/models/` package, now with **real foreign keys**
- Auth (JWT, RBAC, password reset) → `app/modules/auth/`
- Order lifecycle + state machine → `app/modules/orders/`
- Product/category/media CRUD → `app/modules/catalog/`
- Email sending + templates → `app/modules/notify/`
- Next.js pages, cart hook, `useT()` i18n hook, fingerprint → kept as-is

RabbitMQ publish/consume calls collapse into **direct function calls**. Most of the consumer code disappears entirely.

---

## 3. The feed engine — the differentiator

This is the part that makes the store feel intelligent. Everything else is table stakes.

### 3.1 Signals

Every interaction writes one row. Anonymous visitors are tracked by the existing canvas fingerprint (`_vid`).

| Signal | Weight | Captured on |
|---|---|---|
| impression | 1 | product card enters viewport |
| click | 3 | product page opened |
| dwell | `log₂(seconds + 1)` capped at 6 | product page unmount |
| scroll_depth | 2 | ≥70% through a category |
| search | 4 | query submitted (explicit intent) |
| add_to_cart | 8 | — |
| purchase | 10 | — |

### 3.2 Interest model

Signals **decay** so interest stays current:

```
affinity(user, category) = Σ ( weight × 0.5 ^ (age_days / 7) )
```

Half-life 7 days. Normalized to 0..1 across the user's categories.

In parallel, a **user vector** = weighted mean of the pgvector embeddings of everything they engaged with. Gives semantic reach the category tree cannot express ("minimal", "vintage", "matte black").

### 3.3 Ranking

```
score = w_affinity  · affinity(user, product.category_path)
      + w_semantic  · cosine(user_vector, product.embedding)
      + w_popular   · popularity_7d(product)
      + w_fresh     · recency_decay(product.created_at)
      + w_business  · business_boost(product)
      − w_fatigue   · times_already_shown(user, product)
```

**All weights live in a DB table and are editable from the admin panel.** `business_boost` is the lever the owner asked for: push high-margin stock, clear overstock, promote new arrivals. The owner tunes what the store pushes without touching code.

### 3.4 Explore vs exploit

A brand-new visitor has no signal, so the feed must start broad and narrow as it learns.

```
ε = max(0.15, 1 / (1 + 0.05 × total_signal_mass))
```

Per page of 24 cards:
- `ceil(ε × 24)` **explore** slots — diverse sample from categories the user has *not* engaged with
- remaining **exploit** slots — top-scored, capped at **6 per category** so no page becomes monotonous
- explore items are **interleaved**, never clumped at the end

Result: page 1 is a broad, beautiful sample. By page 3 it is visibly *their* store. ε never reaches 0 — we always leave room for discovery.

### 3.5 Feed recomputes as you scroll

Each page request re-reads fresh signals. Scrolling is not pagination through a fixed list — it is a conversation with the store.

---

## 4. Taxonomy

Self-referencing tree (the existing `categories.parent_id` already supports this) plus **facets** — the things people actually filter by.

```
Clothing
└── T-Shirts
    ├── Oversize
    └── Slim
        facets: size(S,M,L,XL) · color · material · fit
```

- Category tree → navigation and affinity
- Facets → filtering and variants
- Variants carry their own SKU, price, stock

---

## 5. AI shopping concierge

OpenAI function calling. The assistant does not just answer — it **acts**.

| Tool | Purpose |
|---|---|
| `search_products(query, filters)` | semantic + keyword hybrid |
| `get_product(id)` | details, variants, stock |
| `add_to_cart(product_id, variant, qty)` | |
| `view_cart` / `remove_from_cart` | |
| `place_order(contact, address)` | **requires explicit user confirmation** |
| `track_order(token)` | |
| `get_recommendations()` | taps the same feed engine |
| `request_custom_item(description, budget, refs)` | when nothing matches |
| `escalate_to_human()` | WhatsApp handoff |

**"If we cannot find it, we make it."** `request_custom_item` is the standout feature — it turns a dead end into a lead, and it is the natural fit for the 3D-printing side of the catalogue.

Custom request lifecycle: `requested → quoted → approved → in_production → ready → delivered`

---

## 6. Orders and notification

### State machine
```
placed → confirmed → preparing → ready → out_for_delivery → delivered
                  ↘ cancelled          ↘ failed → returned
```

### Every transition notifies on two channels
- **Email** — written per language, EN/AR, plain text beside the HTML
- **WhatsApp** — click-to-chat link, which in this market *is* the phone number

There was a third — an in-app notification bell, ported from
notification-service. It was removed: it wrote to a table keyed on `user_id`,
and nobody here is ever a signed-in customer. Buying never requires an account,
so `customer_id` was null on every order and the bell never rang.

The customer is **never** left wondering where their order is. Admin can change state manually from the panel and the customer is notified automatically.

---

## 7. Admin panel — the control room

The owner said this is the most important surface. It is not a CRUD table.

| Area | Contents |
|---|---|
| **Pulse** | today's revenue, orders, visitors, conversion, live activity |
| **Decide** | *what should I stock next* — demand forecast, dead stock, stockout risk, margin by category |
| **Feed control** | tune the ranking weights; boost/bury products; see what the algorithm is currently pushing |
| **Orders** | state changes, delivery assignment, custom-request quoting |
| **Catalog** | products, variants, categories, media |
| **AI copilot** | ask anything in plain language |

### Admin AI tools
| Tool | Purpose |
|---|---|
| `query_metrics(metric, period, breakdown)` | any number, any slice |
| `forecast_demand(target, horizon)` | what to reorder |
| `analyze_stock()` | stockout risk + dead stock |
| `suggest_pricing(product_id)` | margin vs velocity |
| `explain_kpi(name)` | **teaches** the owner what a metric means |
| `generate_report(period)` | narrative summary |
| `adjust_feed_weights(...)` | with confirmation |

`explain_kpi` matters: the panel should make the owner *better at running the business*, not just show numbers.

---

## 8. Design direction — soft and warm

Away from the current black/orange.

| | |
|---|---|
| **Palette** | warm sand, cream, soft clay, warm charcoal text; one muted accent |
| **Space** | generous — whitespace signals confidence and calm |
| **Shape** | large radii, soft diffuse shadows, no hard borders |
| **Motion** | slow and gentle (250–400ms ease-out). Nothing snaps. |
| **Type** | large, high line-height, comfortable to read one-handed |
| **Focus** | **one primary action per screen** |
| **Mobile** | designed for phone first — 99% of traffic. Thumb-reachable targets ≥44px. |
| **RTL** | Arabic is first-class, not a translation layer bolted on |

Guiding feeling: *simple enough to never think, warm enough to stay.*

---

## 9. Phases

| # | Phase | Delivers |
|---|---|---|
| 0 | **Consolidate** | 8 services → 1 FastAPI monolith, 8 DBs → 1, drop RabbitMQ/Meilisearch/gateway |
| 1 | **Data model** | category tree, facets, variants, signals table, embeddings |
| 2 | **Feed engine** | affinity, scoring, ε explore/exploit, fatigue |
| 3 | **Redesign** | landing, store feed, product, cart, checkout — warm system |
| 4 | **Orders** | state machine + email and WhatsApp notification |
| 5 | **AI concierge** | buyer-facing assistant with tools |
| 6 | **Custom requests** | request → quote → production → delivery |
| 7 | **Admin** | pulse, decide, feed control, AI copilot |

Phases 0–1 are mechanical and low-risk. Phase 2 is the differentiator. Phases 5 and 7 reuse tool-calling code from the owner's existing projects.

---

## 10. Constraints — permanent

- **English and Arabic only.** No French anywhere, in code or UI.
- **Single owner.** No multi-vendor, no seller marketplace, no KYC queue.
- **Production quality.** No demos, no mock data, no placeholder handlers.
- **Mobile first.** 99% of buyers are on a phone.
- **Cash on Delivery.** Currency MAD. Market: Morocco.
- **No duplicated code.** Shared logic gets extracted the first time it repeats, not the third.
- **Soft and warm.** Every design decision defers to how it makes the visitor feel.
