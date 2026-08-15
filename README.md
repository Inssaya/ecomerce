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




