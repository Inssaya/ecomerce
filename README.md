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
┌──────────────────────────────────────────────┐
│  Next.js 14  (storefront + workshop panel)   │
└───────────────────┬──────────────────────────┘
                    │  /api/*
┌───────────────────▼──────────────────────────┐
│  FastAPI — one app                           │
│  auth · catalog · orders · notify            │
└───────────────────┬──────────────────────────┘
                    │
     PostgreSQL 16 + pgvector · Redis · MinIO
```

Six containers. It used to be sixteen: eight services, a gateway, RabbitMQ and
Meilisearch, for a shop with one owner. Cross-service joins were HTTP calls and
nothing could hold a foreign key. Phase 0 collapsed all of it into one process
on one database.

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
  core/          security, storage, cache, slugs, errors, llm, agent loop
  models/        the whole schema, one package
  modules/       auth · catalog · orders · requests · feed · notify · admin · ai
```

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
  app/[lang]/    landing · store · piece · cart · checkout · track · ask · orders · workshop
  app/           robots.ts · sitemap.ts
  components/    Chrome · PieceCard · CartProvider · Assistant · WaitForMore
  lib/           api · server · admin · i18n · signals · fingerprint
```

Every route lives under `/en` or `/ar`. There is no third language and no
translation layer: both are authored, and the Arabic is written as Arabic.

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
