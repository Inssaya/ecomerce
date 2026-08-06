#!/bin/sh
# Migrate, then serve.
#
# Running `alembic upgrade head` here rather than by hand is the difference
# between a deploy that works and one where the code expects a column the
# database does not have. It is safe to run every start: Alembic is a no-op
# when the schema is already current.
#
# It deliberately does *not* start the API if the migration fails. A shop
# serving a half-migrated schema takes orders it cannot fulfil, and a container
# that refuses to start is a problem you notice immediately.
set -e

echo "Waiting for the database…"
until python -c "
import asyncio, os, sys
import asyncpg

async def main():
    url = os.environ['DATABASE_URL'].replace('postgresql+asyncpg://', 'postgresql://')
    try:
        connection = await asyncpg.connect(url)
    except Exception:
        sys.exit(1)
    await connection.close()

asyncio.run(main())
" 2>/dev/null; do
  sleep 1
done

echo "Migrating…"
alembic upgrade head

echo "Starting the API."
exec "$@"
