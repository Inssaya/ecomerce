# MoStyle

**Made, not resold. — نصنع، لا نعيد البيع**

A workshop, not a shop. We own the machines and make pieces one at a time —
3D printed, machined, hand-finished. Two ways to buy: **The Shelf** (pieces
already made, finite, real photos, piece-numbered) and **The Workshop** (you
describe it, we make it).

Read [`docs/BRAND.md`](docs/BRAND.md) for why any of this matters commercially,
and [`docs/REBUILD-PLAN.md`](docs/REBUILD-PLAN.md) for how it is built.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  Next.js 15  storefront · owner panel · local pages    │
└──────────────────────────┬─────────────────────────────┘
                           │  /api/*
┌──────────────────────────▼─────────────────────────────┐
│  FastAPI — one app                                     │
│  auth · catalog · orders · requests · feed             │
│  notify · admin · ai · local                           │
└──────────────────────────┬─────────────────────────────┘
                           │
        PostgreSQL 16 + pgvector · Redis · MinIO
```

Six containers in production — Postgres, Redis, MinIO, the API, the storefront
and nginx, plus certbot and a nightly backup alongside them. It used to be
sixteen: eight services, a gateway, RabbitMQ and Meilisearch, for a shop with
one owner. Cross-service joins were HTTP calls and nothing could hold a foreign
key. Phase 0 collapsed all of it into one process on one database.

## What it does

**For a buyer.** One shelf that reorders itself around what you look at, a
search, a piece page carrying the whole batch drawn as marks, a cart, a
cash-on-delivery checkout, and a tracking page — plus a way back into an order
from the reference and your phone when the link is lost, and a way to be told
when a sold-out piece is made again. If the shelf has nothing, describe what
you want and we come back with a price and a real date. A shopping assistant
answers questions about a piece over the same catalogue the pages read.

**For the owner.** Today at a glance; the orders screen that moves each one
along and tells the customer; quoting for custom requests; the shelf, where a
piece is created, photographed, made and published. Then the reading: a live
funnel counting people rather than events, a per-piece and per-screen table, a
seven-day forecast with a range and its reasoning, the money and the refusal
rate, and a copilot that answers from the same functions the screens read.

**For being found.** Both languages throughout, real metadata and structured
data on every public page, five written service pages, twenty-nine Moroccan
cities with honest delivery windows, and a sitemap built from the catalogue.

## Running it

```bash
cp .env.example .env          # fill in JWT_SECRET and the passwords
docker compose --profile dev up --build

docker compose exec api alembic upgrade head
docker compose exec api python -m app.cli seed-owner \
    you@mostyle.ma 'a long real password' 'Your Name'
```

- Storefront — http://localhost:3000
- API — http://localhost:8000 (`/docs` when `ENVIRONMENT` is not `production`)
- Caught email — http://localhost:8025
- Photo storage console — http://localhost:9001

There is one owner account and it cannot be created through the API:
`/auth/register` always produces a customer. Provision it with `seed-owner`.

## Working on the backend

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt

.venv/bin/ruff check .
TEST_DATABASE_URL=postgresql+asyncpg://mostyle:mostyle@127.0.0.1:5432/mostyle_test \
  .venv/bin/python -m pytest
```

The tests run against a real Postgres, not SQLite. The schema depends on
foreign keys, `SELECT … FOR UPDATE` and enum types, and none of those behave
the same way on SQLite — testing there would be testing a different program.

```
backend/app/
  config.py      one settings object for the process
  db.py          engine, session, declarative base
  deps.py        identity, language and paging dependencies
  cli.py         seed-owner
  core/          security, storage, cache, slugs, errors, limits, llm, agent
  models/        the whole schema, one package
  modules/       auth · catalog · orders · requests · feed
                 notify · admin · ai · local
```

`admin/` is three files worth knowing about: `metrics.py` answers the business
questions, `analytics.py` answers *what happens on the site* and counts people
rather than events, and `forecast.py` says what the next seven days look like
and why. All three are read by the copilot as well as by the panel, so the
assistant and the screen cannot disagree.

Coverage is measured with `concurrency = greenlet` — see `.coveragerc`. Without
it SQLAlchemy's async layer hides most of what the tests actually run, and the
report understates by more than ten points.

## Working on the storefront

```bash
cd frontend
npm install
npm run lint && npm run type-check
INTERNAL_API_URL=http://127.0.0.1:8000 NEXT_PUBLIC_SITE_URL=https://mostyle.ma npm run build
```

`INTERNAL_API_URL` matters at **build** time, not run time: Next evaluates
`rewrites()` when it builds and writes the result into the routes manifest. In
Docker the default already matches the compose service name, so only a local
build outside Docker needs it set. The same variable is what server-rendered
pages read the API through (`lib/server.ts`), because `/api` only resolves in a
browser.

`NEXT_PUBLIC_SITE_URL` is the public origin, and it has to be right: every
canonical link, `hreflang`, sitemap entry and share image is absolute against
it, and WhatsApp and Google both ignore metadata that is not. Set it wrong and
the site tells Google the real version of every page lives somewhere else.

`MEDIA_HOSTNAMES` is a comma-separated list of hosts photographs may be loaded
from — the object storage domain, which is usually *not* the site's own. Next
refuses images from unlisted hosts, so an empty value in production means every
product photo is silently broken. MinIO on `localhost:9000` and `minio:9000` is
always allowed, so local development needs nothing set.

### Going live on a domain

Four values have to change together, and they are in three different places:

| Where | Value | Set it to |
|---|---|---|
| Frontend build | `NEXT_PUBLIC_SITE_URL` | `https://yourdomain` |
| Frontend build | `MEDIA_HOSTNAMES` | your object storage host |
| Frontend build | `INTERNAL_API_URL` | where the API answers |
| Backend | `APP_URL` | `https://yourdomain` |

`APP_URL` is the one people forget. The backend builds tracking links, quote
links and password-reset links from it and puts them in emails — if it still
says `localhost:3000`, every link the shop sends a customer is dead.

Pick one hostname and redirect the other. Serving both `example.ma` and
`www.example.ma` splits the ranking of every page between two URLs, and the
canonical tags will name only one of them.

```
frontend/src/
  app/[lang]/    landing · store · piece · cart · checkout · track
                 ask · request · orders · account/reset
                 make/[service] · delivery · delivery/[city] · workshop
  app/           robots.ts · sitemap.ts
  components/    Chrome · PieceCard · CartProvider · Assistant
                 WaitForMore · charts · ambient
  lib/           api · server · admin · detail · i18n · signals · fingerprint
```

```bash
npm test          # vitest, the owner screens and the admin client
```

The tests are aimed at behaviour with a consequence — that a button calls what
it claims to, that only legal moves are offered — not at markup. They found two
real defects on their first run, which is the argument for them.

Every route lives under `/en` or `/ar`. There is no third language and no
translation layer: both are authored, and the Arabic is written as Arabic.

## Putting it on a machine

One VPS runs all of it: Postgres with pgvector, Redis, MinIO, the API, the
storefront and nginx. That is the shape this rebuild consolidated toward, and
splitting it back across three providers to deploy it would undo the point.

A 2 vCPU / 4 GB box is enough. Point `mostyle.ma`, `www.mostyle.ma` and
`media.mostyle.ma` at its IP first — the certificate covers all three.

```bash
git clone <this repo> && cd ecomerce
cp .env.example .env && $EDITOR .env      # see the table below
./infra/certbot-init.sh mostyle.ma you@yourdomain
./deploy.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec api python -m app.cli seed-owner you@yourdomain 'a long password' 'Your Name'
```

`deploy.sh` is also the update path — pull and run it again.

**The order inside it is not arbitrary.** The service and city pages enumerate
their slugs at build time by asking the API, so the API is started and migrated
*before* the storefront image is built. Build them the other way round and you
get a site with no `/make` and no `/delivery` pages at all, which looks like a
successful deploy until someone searches for one.

### What has to be right

| Value | Why it matters |
|---|---|
| `APP_URL` | Every tracking link, quote link and reset link in every email, and every canonical URL and share card. Wrong here and the shop emails dead links. |
| `MEDIA_HOSTNAMES` | Next refuses images from unlisted hosts. Empty in production means every product photo is silently broken. |
| `JWT_SECRET` | The API refuses to start in production without at least 32 characters. `openssl rand -hex 64`. |
| `SMTP_*` | Order emails go to spam without SPF and DKIM on the domain — and a customer who never sees "on its way" refuses the package. |

### What the production overlay changes

Nothing is published to the internet except nginx on 80 and 443. The API, the
storefront and Postgres are reachable only inside the compose network, and
MinIO only on loopback — photographs reach browsers through nginx on
`media.` instead, so they get TLS and a year of caching.

It also runs certificate renewal every twelve hours and a nightly `pg_dump`
into `./backups`, kept a fortnight. **Copy that directory off the machine as
well** — a backup on the same disk as the database is not a backup.

## The AI

Both assistants need an OpenAI-compatible key. Without one they report
themselves unavailable and the storefront simply does not show the assistant —
nothing degrades into a guess.

```
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1     # or Groq, or a local model
LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
```

After adding pieces, embed them so semantic search and the feed can reach past
the category tree — it skips anything whose words have not changed:

```bash
curl -X POST localhost:8000/api/admin/feed/embeddings -H "authorization: Bearer $TOKEN"
```

## The rules this codebase is held to

- **English and Arabic only.** No French, in code or UI. Both languages are
  authored; neither is generated from the other.
- **Single owner.** No multi-vendor, no seller marketplace, no KYC queue.
- **Cash on delivery.** MAD. Morocco. The phone number is the identity, and
  buying never requires an account.
- **Real photos only.** A piece cannot be published without a photograph of
  itself. No stock images, no invented scarcity, no countdown timers.
- **Mobile first.** 99% of buyers are on a phone.
- **No duplicated code.** Shared logic is extracted the first time it repeats.
