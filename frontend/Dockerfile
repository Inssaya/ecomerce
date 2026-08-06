# The storefront, built for production.
#
# Next bakes three things into the build rather than reading them at run time,
# which is why they are build arguments and not environment variables:
#
#   * `rewrites()` is evaluated once and written into the routes manifest, so
#     INTERNAL_API_URL decides where /api goes forever after.
#   * Every canonical URL, hreflang pair, sitemap entry and share card is
#     absolute against NEXT_PUBLIC_SITE_URL, and most pages are prerendered.
#   * `remotePatterns` decides which hosts photographs may load from.
#
# Set them wrong at build time and the running container cannot correct it.
#
# The build also *calls the API*: the service and city pages enumerate their
# slugs with `generateStaticParams`. If the API is unreachable while this
# image is built, it produces zero of those pages and they 404 in production.
# `deploy.sh` starts the API before building this, for exactly that reason.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app

ARG INTERNAL_API_URL=http://api:8000
ARG NEXT_PUBLIC_SITE_URL
ARG MEDIA_HOSTNAMES
ARG NEXT_PUBLIC_APP_NAME=MoStyle

ENV INTERNAL_API_URL=$INTERNAL_API_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    MEDIA_HOSTNAMES=$MEDIA_HOSTNAMES \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache curl \
    && addgroup -g 10001 -S workshop \
    && adduser -u 10001 -S workshop -G workshop

# `output: standalone` emits a server plus only the node_modules it actually
# uses — but it does not copy the static assets or the public directory, and a
# site served without them looks like unstyled HTML. That is the single most
# common way this image is got wrong.
COPY --from=builder --chown=workshop:workshop /app/.next/standalone ./
COPY --from=builder --chown=workshop:workshop /app/.next/static ./.next/static
COPY --from=builder --chown=workshop:workshop /app/public ./public

USER workshop
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://localhost:3000/en || exit 1

CMD ["node", "server.js"]
