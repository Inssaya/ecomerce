#!/usr/bin/env bash
# Deploy the shop onto this machine.
#
#     ./deploy.sh
#
# The order below is not arbitrary. The storefront's service and city pages
# enumerate their slugs at build time by asking the API — so the API has to be
# up, migrated and seeded *before* the web image is built, or the build quietly
# produces a site with no /make and no /delivery pages at all and they 404 in
# production. That is the one failure in this setup that looks like success.
#
# Safe to run repeatedly. It is the update path as well as the install path.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

if [ ! -f .env ]; then
  echo "No .env — copy .env.example to .env and fill it in first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a

: "${APP_URL:?APP_URL must be set — every tracking link and reset link in every email is built from it}"
: "${JWT_SECRET:?JWT_SECRET must be set — generate with: openssl rand -hex 64}"
: "${MEDIA_HOSTNAMES:?MEDIA_HOSTNAMES must be set — without it every product photo fails to load}"

echo "── 1/5  Database, cache and storage"
$COMPOSE up -d postgres redis minio

echo "── 2/5  API (migrations run in its entrypoint)"
$COMPOSE up -d --build api
# Wait for it to be answering, because the next step depends on it.
for _ in $(seq 1 60); do
  if $COMPOSE exec -T api curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! $COMPOSE exec -T api curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
  echo "The API did not come up. Stopping — building the storefront now would" >&2
  echo "produce a site with no service or city pages." >&2
  $COMPOSE logs --tail=40 api >&2
  exit 1
fi

echo "── 3/5  Storefront (built against the live API)"
$COMPOSE up -d --build web

echo "── 4/5  nginx, certificate renewal and nightly backups"
$COMPOSE up -d nginx certbot backup

echo "── 5/5  Checking"
sleep 3
$COMPOSE ps
echo
if curl -fsS -o /dev/null "${APP_URL}/en"; then
  echo "The shop is up at ${APP_URL}"
else
  echo "The shop did not answer at ${APP_URL} — check: $COMPOSE logs nginx web" >&2
fi

# A one-line reminder of the thing that is not automatic.
if ! $COMPOSE exec -T api python -c "
import asyncio
from sqlalchemy import select
from app.db import SessionLocal
from app.models import User, UserRole

async def main():
    async with SessionLocal() as db:
        owner = await db.scalar(select(User).where(User.role == UserRole.owner))
        raise SystemExit(0 if owner else 1)

asyncio.run(main())
" >/dev/null 2>&1; then
  echo
  echo "No owner account yet. Create one before anything can be put on the shelf:"
  echo "    $COMPOSE exec api python -m app.cli seed-owner you@yourdomain 'a long password' 'Your Name'"
fi
