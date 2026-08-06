FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Not root: the app writes nothing to disk that it needs to own.
RUN useradd --create-home --uid 10001 workshop && chown -R workshop:workshop /srv
USER workshop

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Migrations run first, in the entrypoint, and a failed migration stops the
# container rather than serving a schema the code does not match.
ENTRYPOINT ["/srv/entrypoint.sh"]

# One worker per container; scale by adding containers, not threads — the
# process is I/O bound on Postgres and the connection pool is per process.
#
# `--forwarded-allow-ips` is required behind nginx: without it uvicorn ignores
# X-Forwarded-For, and the rate limiter would see every request as coming from
# the proxy and limit the whole shop as one visitor.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
