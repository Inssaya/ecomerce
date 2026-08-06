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
INTERNAL_API_URL=http://127.0.0.1:8000 npm run build
```

`INTERNAL_API_URL` matters at **build** time, not run time: Next evaluates
`rewrites()` when it builds and writes the result into the routes manifest. In
Docker the default already matches the compose service name, so only a local
build outside Docker needs it set.

```
frontend/src/
  app/[lang]/    landing · store · piece · cart · checkout · track · ask · workshop
  components/    Chrome · PieceCard · CartProvider · Assistant
  lib/           api · admin · i18n · signals · fingerprint
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
