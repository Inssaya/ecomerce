# MoStyle — Multi-Vertical E-Commerce Platform

A production-grade single-owner e-commerce platform for Morocco with 4 verticals (fashion, 3D print, electronics, eyewear). Mobile-first, bilingual (English/Arabic + RTL), Cash on Delivery only.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              Next.js 14 Frontend (port 3000)                 │
│       SSR storefront · admin dashboard · buyer account       │
└─────────────────────┬────────────────────────────────────────┘
                      │ HTTP /api/*
┌─────────────────────▼────────────────────────────────────────┐
│           API Gateway (port 8000)                            │
│      JWT validation · routing · rate limiting                │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬───────────────-┘
   │      │      │      │      │      │      │
  8001   8002   8003   8004   8005   8006   8007   8008
  auth  catalog seller  order  delivery notif  rec   admin
```

### Services

| Service | Port | Purpose |
|---|---|---|
| gateway | 8000 | JWT auth, reverse proxy, rate limiting |
| auth-user-service | 8001 | Registration, login, JWT, RBAC, password reset |
| catalog-service | 8002 | Products, categories, images, Meilisearch indexing |
| seller-service | 8003 | Seller onboarding, earnings, commission tracking |
| order-service | 8004 | Checkout (COD), order lifecycle, stock events |
| delivery-service | 8005 | Delivery agents, assignment, COD reconciliation |
| notification-service | 8006 | In-app notifications + transactional email |
| recommendation-service | 8007 | Dwell-time signals, view tracking, product recs |
| admin-service | 8008 | Platform metrics, user management |
| frontend | 3000 | Next.js 14 App Router storefront |

### Infrastructure

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL 16 + pgvector | 5432 | One DB per service |
| Redis 7 | 6379 | Session cache, rate limiting |
| RabbitMQ 3.13 | 5672 / 15672 | Async event bus (order.placed, order.delivered, ...) |
| Meilisearch v1.8 | 7700 | Full-text + faceted product search |
| MinIO | 9000 / 9001 | Product image storage (S3-compatible) |
| Mailpit | 1025 / 8025 | Dev email catcher |

## Quick Start (Docker — recommended)

**Requirements:** Docker Desktop (or Docker Engine + Compose v2), Git

```bash
# 1. Clone
git clone https://github.com/inssaya/ecomerce.git
cd ecomerce

# 2. Configure environment
cp .env.example .env
# Open .env and change at minimum:
#   POSTGRES_PASSWORD, RABBITMQ_PASSWORD, MINIO_ROOT_PASSWORD
#   JWT_SECRET  ← run: openssl rand -hex 64
#   MEILI_MASTER_KEY  ← run: openssl rand -hex 32

# 3. Start everything
docker compose up --build

# First boot takes 3-5 min (downloads base images, builds services, runs migrations)
```

Once running, open:

| URL | What |
|---|---|
| http://localhost:3000 | Storefront (MoStyle) |
| http://localhost:8000/docs | API Gateway (Swagger UI) |
| http://localhost:8025 | Mailpit — catch all outbound emails |
| http://localhost:15672 | RabbitMQ management (`mostyle` / your password) |
| http://localhost:9001 | MinIO console (`mostyle_admin` / your password) |
| http://localhost:7700 | Meilisearch dashboard |

### Create the first admin user

```bash
# Register normally via the UI, then promote via the DB
docker compose exec postgres psql -U mostyle -d auth_db \
  -c "UPDATE users SET role='admin' WHERE email='your@email.com';"
```

## Stores

The platform ships with 4 pre-configured store verticals. Each is accessible at `/store/<slug>`:

| Slug | Name |
|---|---|
| `clothes` | Fashion |
| `3dprint` | 3D Print |
| `electronics` | Electronics |
| `glasses` | Eyewear |

In production, subdomains (`clothes.mostyle.ma`) are handled by the nginx config in `infra/nginx/`.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2.0 (async) |
| Frontend | Next.js 14 App Router + TypeScript + Tailwind CSS |
| Database | PostgreSQL 16 + pgvector (one DB per service) |
| Cache | Redis 7 |
| Messaging | RabbitMQ 3.13 (TOPIC exchange: `ecomerce`) |
| Search | Meilisearch v1.8 |
| Object storage | MinIO (S3-compatible) |
| Auth | JWT access (30 min) + refresh (7 days), RBAC |
| Language | Bilingual EN/AR with RTL support |
| Currency | MAD (Moroccan Dirham) |
| Payment | Cash on Delivery only |

## Project Structure

```
ecomerce/
├── docker-compose.yml          # Full stack definition
├── .env.example                # Environment template — copy to .env
├── gateway/                    # FastAPI reverse proxy + JWT middleware
├── frontend/                   # Next.js 14 storefront
│   └── src/
│       ├── app/                # App Router pages
│       ├── components/         # Shared UI components
│       ├── hooks/              # useCart, useT (i18n), useT
│       └── contexts/           # LanguageContext (EN/AR)
├── services/
│   ├── auth-user-service/
│   ├── catalog-service/
│   ├── seller-service/
│   ├── order-service/
│   ├── delivery-service/
│   ├── notification-service/
│   ├── recommendation-service/
│   └── admin-service/
└── infra/
    └── nginx/                  # Production nginx config (subdomain routing)
```

## Development — single service

Each service is an independent FastAPI app with its own `requirements.txt`:

```bash
cd services/auth-user-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

The service needs its environment variables set (copy from `.env` and adapt `DATABASE_URL` etc.).

## Using with VS Code + Claude Code

1. Download and install [VS Code](https://code.visualstudio.com/)
2. Install the [Claude Code extension](https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-code) from the VS Code marketplace
3. Clone this repo and open the folder in VS Code
4. Click the Claude icon in the sidebar — Claude can read, edit, and run the entire codebase

## Key Environment Variables

| Variable | Description | Example |
|---|---|---|
| `JWT_SECRET` | Signs all JWT tokens — must be long and random | `openssl rand -hex 64` |
| `MEILI_MASTER_KEY` | Meilisearch API key | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | PostgreSQL password | strong random string |
| `SMTP_HOST` | Email server host | `smtp.sendgrid.net` (production) |
| `APP_URL` | Public site URL for email links | `https://mostyle.ma` |
| `NEXT_PUBLIC_API_URL` | API gateway URL (browser-visible) | `https://api.mostyle.ma` |

## Production Deployment

1. Set all passwords and secrets in `.env` (never commit `.env`)
2. Point DNS: `mostyle.ma` and `*.mostyle.ma` → your server IP
3. Replace Mailpit with a real SMTP provider (SendGrid, Mailgun, SES)
4. Set `NODE_ENV=production` and `MEILI_ENV=production`
5. Use the nginx config in `infra/nginx/` — run certbot for SSL
6. `docker compose up -d --build`

## RabbitMQ Events

All async communication uses the `ecomerce` TOPIC exchange:

| Routing key | Published by | Consumed by |
|---|---|---|
| `order.placed` | order-service | catalog-service (stock), notification-service |
| `order.assigned` | order-service | notification-service |
| `order.delivered` | order-service | notification-service |
| `order.cancelled` | order-service | notification-service |
| `kyc.approved` | admin-service | notification-service |
| `kyc.rejected` | admin-service | notification-service |
