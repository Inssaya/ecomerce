#!/usr/bin/env bash
# The first certificate. Run once, before the first deploy.
#
# There is a chicken and egg here that traps people: the nginx config points at
# certificate files, so nginx will not start without them — but certbot needs
# nginx running to answer the ACME challenge over port 80. This script breaks
# the loop by serving the challenge from a bare nginx with no TLS at all, then
# handing over.
#
# Run it from the repository root:
#     ./infra/certbot-init.sh mostyle.ma you@example.com
set -euo pipefail

DOMAIN="${1:?Usage: infra/certbot-init.sh <domain> <email>}"
EMAIL="${2:?Usage: infra/certbot-init.sh <domain> <email>}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

echo "Getting a certificate for ${DOMAIN}, www.${DOMAIN} and media.${DOMAIN}."
echo "All three must already point at this machine — check with:"
echo "    dig +short ${DOMAIN}"
echo

# A throwaway nginx that only serves the challenge directory.
cat > /tmp/acme-nginx.conf <<'CONF'
events {}
http {
  server {
    listen 80;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'waiting for a certificate'; add_header Content-Type text/plain; }
  }
}
CONF

$COMPOSE up -d --no-deps postgres redis minio
docker run -d --rm --name acme-nginx \
  --network mostyle_mostyle \
  -p 80:80 \
  -v /tmp/acme-nginx.conf:/etc/nginx/nginx.conf:ro \
  -v mostyle_certbot_webroot:/var/www/certbot \
  nginx:1.27-alpine

cleanup() { docker stop acme-nginx >/dev/null 2>&1 || true; }
trap cleanup EXIT

sleep 2

docker run --rm \
  -v mostyle_certbot_certs:/etc/letsencrypt \
  -v mostyle_certbot_webroot:/var/www/certbot \
  certbot/certbot:latest certonly \
    --webroot -w /var/www/certbot \
    -d "${DOMAIN}" -d "www.${DOMAIN}" -d "media.${DOMAIN}" \
    --email "${EMAIL}" --agree-tos --no-eff-email \
    --non-interactive

echo
echo "Done. Now run ./deploy.sh"
