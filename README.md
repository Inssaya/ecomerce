# Ecomerce — Multi-Vendor SaaS Marketplace

A production-grade multi-vendor e-commerce platform built with microservices.
Sellers list products, buyers order with COD, delivery agents fulfil, and a
super-admin oversees everything. An AI recommendation engine driven by
view-dwell-time makes product discovery first-class.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js Frontend (3000)               │
│          SSR storefront · seller dashboard · admin UI        │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP
┌────────────────────────────▼────────────────────────────────┐
│              API Gateway (8000)                              │
│   Routing · CORS · Rate limiting · JWT forwarding           │
└──┬───┬───┬───┬───┬───┬───┬───┬──────────────────────────────┘
   │   │   │   │   │   │   │   │
 8001 8002 8003 8004 8005 8006 8007 8008
  │   │   │   │   │   │   │   │
auth cat sel ord del not rec adm
  │   │   │   │   │   │   │   │
  └───┴───┴───┴───┴───┴───┴───┘
           PostgreSQL (per DB)
        Redis · RabbitMQ · MinIO
       Meilisearch · Mailpit
```

### Services

| Service | Port | Database | Responsibility |
|---|---|---|---|
| gateway | 8000 | — | Reverse proxy, auth forwarding, rate limiting |
| auth-user-service | 8001 | auth_db | Registration, login, JWT, RBAC, KYC |
| catalog-service | 8002 | catalog_db | Products, categories, labels, search |
| seller-service | 8003 | seller_db | Seller onboarding, dashboard, commission |
| order-service | 8004 | order_db | Cart, checkout (COD), order state machine |
| delivery-service | 8005 | delivery_db | Agents, assignment, tracking, COD reconciliation |
| notification-service | 8006 | notification_db | Email + in-app notifications |
| recommendation-service | 8007 | recommendation_db | Dwell-time signals, hybrid scoring, rec rails |
| admin-service | 8008 | admin_db | KYC queue, oversight, platform metrics |
| frontend | 3000 | — | Next.js SSR + React storefront |

### Infrastructure

| Service | Port | Purpose |
|---|---|---|
| PostgreSQL (pgvector) | 5432 | Primary datastores (one DB per service) |
| Redis | 6379 | Session cache, rate limiting, dwell buffer |
| RabbitMQ | 5672 / 15672 | Async event bus |
| Meilisearch | 7700 | Full-text + faceted product search |
| MinIO | 9000 / 9001 | Object storage (product images, encrypted KYC docs) |
| Mailpit | 1025 / 8025 | Dev SMTP catcher |

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env — at minimum change JWT_SECRET

# 2. Boot the full stack
docker compose up --build

# 3. Open in browser
#   Storefront       →  http://localhost:3000
#   API Gateway docs →  http://localhost:8000/docs
#   RabbitMQ mgmt    →  http://localhost:15672  (user/pass from .env)
#   MinIO console    →  http://localhost:9001   (user/pass from .env)
#   Mailpit inbox    →  http://localhost:8025
#   Meilisearch      →  http://localhost:7700
```

## Development

Each service is a standalone FastAPI app. To iterate on a single service:

```bash
cd services/auth-user-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Running migrations

```bash
cd services/<service-name>
alembic upgrade head
```

### Running tests

```bash
cd services/<service-name>
pip install pytest pytest-asyncio
pytest tests/
```

## Build Phases

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ | Scaffolding & infrastructure |
| 1 | ⏳ | Auth & roles |
| 2 | ⏳ | Catalog (products, labels, search) |
| 3 | ⏳ | Storefront (SSR, browse, search) |
| 4 | ⏳ | Seller onboarding & products |
| 5 | ⏳ | Cart & orders (COD) |
| 6 | ⏳ | Delivery & KYC |
| 7 | ⏳ | Notifications |
| 8 | ⏳ | Recommendations (dwell-time, hybrid scoring) |
| 9 | ⏳ | Super-admin dashboard |
| 10 | ⏳ | Hardening, tests, docs |

## Tech Stack

- **Backend**: Python 3.12 + FastAPI
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Databases**: PostgreSQL 16 + pgvector (one DB per service)
- **Cache**: Redis 7
- **Messaging**: RabbitMQ 3.13
- **Search**: Meilisearch v1.8
- **Object storage**: MinIO (S3-compatible)
- **Auth**: JWT (access + refresh) + RBAC
- **Currency**: MAD (Moroccan Dirham)
- **Payment**: Cash on Delivery (COD) only
