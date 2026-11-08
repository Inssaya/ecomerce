# Putting M-StyLe online — for free

The same four pieces as [DEPLOY.md](DEPLOY.md), minus the two that cost money:
Render's Starter plan (API) and its Redis add-on. Everything else — Vercel,
Supabase, Cloudflare R2 — is unchanged, because none of those required paying
in the first place.

| Piece | Where | Why there |
|---|---|---|
| Storefront + console (Next.js) | **Vercel** | Free, no change from DEPLOY.md. |
| API (FastAPI) + Redis | **Oracle Cloud Always Free VM** | A real VM, not scale-to-zero — never sleeps, costs nothing. |
| Database + accounts | **Supabase** | Free tier, unchanged. |
| Photographs | **Cloudflare R2** | Free tier, unchanged. |

**The trade-off, stated plainly:** Render/Fly/Railway are free by sleeping an
idle service. Oracle's Always Free tier is free by actually being free — it's
a VM you own, not a managed platform, so it never sleeps, but *you* are now
the one who patches it, restarts it after a reboot, and notices if it goes
down. And Oracle's free Ampere capacity is sometimes hard to provision in a
popular region (retry on a capacity error, it usually isn't permanent), and
it can reclaim an instance that sits at near-zero CPU/network for 7 straight
days — irrelevant once real customers are visiting, a real risk during a
silent launch week with zero traffic.

**No domain, no TLS, on purpose.** The browser never talks to the API
directly — Next's `rewrites()` proxy `/api/*` and `/media/*` same-origin, so
only Vercel's *server* ever calls the Oracle box, over plain HTTP. That's an
ordinary server-to-server call, not a browser connection, so there's nothing
for a "not secure" warning to attach to. This is why Cloudflare Tunnel and a
custom domain aren't in this guide — they solve a problem this architecture
doesn't have. If that stops being true (something that talks to the API
directly from a browser), redo this with a real domain and TLS in front.

---

## 0. What you need before you start

- An Oracle Cloud account (Always Free).
- Everything DEPLOY.md's prerequisites list: the GitHub repo, the Supabase
  project, the R2 bucket, an SMTP sender.

---

## 1. Supabase — the database

Identical to [DEPLOY.md §1](DEPLOY.md#1-supabase--the-database). Turn off
email confirmation, copy the **pooled** connection string (port 6543,
`postgresql+asyncpg://` prefix). You don't need to run migrations by hand —
the API's `entrypoint.sh` runs `alembic upgrade head` on every start and
refuses to serve if it fails.

## 2. Cloudflare R2 — the photographs

Identical to [DEPLOY.md §2](DEPLOY.md#2-cloudflare-r2--the-photographs). The
free `r2.dev` public URL is fine to start; add a custom domain later if you
want, it isn't required for any of this.

## 3. Oracle Cloud — the API

**a. Create the instance**, if you haven't already:

- Compute → Instances → **Create instance**.
- Image: **Ubuntu 22.04** (or 24.04).
- Shape: **VM.Standard.A1.Flex** (the Ampere/ARM Always Free shape) — 2 OCPU /
  12 GB RAM is plenty for one API container and Redis. If creation fails with
  an "out of capacity" error, that's Oracle's free shape being oversubscribed
  in that region, not your account — retry, or try a different availability
  domain.
- Networking: let it create a new VCN, but before you leave this screen,
  **add a Reserved Public IP**, not an ephemeral one. An ephemeral IP can
  change if the instance stops; a Reserved one doesn't, and you're about to
  hard-code this address into Vercel.
- Add your SSH key (or let Oracle generate one and download the private key).

**b. Open the firewall**, in two places — both block the port by default:

1. **Oracle's security list**: your VCN → Security Lists → default → Add
   Ingress Rule → source `0.0.0.0/0`, TCP, destination port `8000`.
2. **Ubuntu's own firewall**, once you're logged in (step c):
   ```sh
   sudo iptables -I INPUT -p tcp --dport 8000 -j ACCEPT
   sudo netfilter-persistent save   # if installed; otherwise this rule won't survive a reboot
   ```

**c. SSH in and install Docker:**

```sh
ssh -i /path/to/your/key ubuntu@<reserved-public-ip>

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in for the group change to take effect
```

**d. Get the backend onto the box and configure it:**

```sh
git clone https://github.com/Inssaya/ecomerce.git
cd ecomerce
cp .env.oracle.example .env
nano .env   # fill in DATABASE_URL, SUPABASE_*, MINIO_* (the R2 creds), SMTP_*, APP_URL
```

Same values as [DEPLOY.md §3b](DEPLOY.md#3-render--the-api)'s table — this is
the same API, just run by hand instead of by Render.

**e. Bring it up:**

```sh
docker compose -f docker-compose.oracle.yml up -d --build
docker compose -f docker-compose.oracle.yml logs -f api
```

Watch for `Migrating…` then `Starting the API.`. Then, from your own machine:

```sh
curl http://<reserved-public-ip>:8000/health
curl http://<reserved-public-ip>:8000/ready   # {"status":"ready","database":true,"redis":true}
```

`/ready` is the one that catches a wrong `DATABASE_URL` — `/health` answers
without touching Postgres or Redis at all.

**f. Keep it running across reboots.** `restart: unless-stopped` brings the
containers back after a crash or a `docker` restart, but not after the *VM*
reboots, unless Docker's own service is enabled:

```sh
sudo systemctl enable docker
```

---

## 4. Vercel — the storefront

Identical to [DEPLOY.md §4](DEPLOY.md#4-vercel--the-storefront), with one
line different:

| Variable | Value |
|---|---|
| `INTERNAL_API_URL` | `http://<reserved-public-ip>:8000` — **not** `https://`, there's no certificate on this box and none is needed (see the note at the top of this file) |

Everything else in that table — `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `MEDIA_ORIGIN`,
`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_WHATSAPP_NUMBER` — is unchanged.

## 5. Make yourself the owner

Same idea as [DEPLOY.md §5](DEPLOY.md#5-make-yourself-the-owner), run on the
VM instead of in a Render shell:

```sh
docker compose -f docker-compose.oracle.yml exec api python -m app.cli make-owner you@example.com
```

## 6. Keep Supabase from pausing itself

A free Supabase project pauses — database *and* auth — after 7 days with no
API request against it. `.github/workflows/keep-alive.yml` hits `/ready`
every Monday, which is a real request against a project you're actually
using (unlike pinging Render to fake traffic, which Render has started
detecting and ignoring). Add the one secret it needs:

> Repo → Settings → Secrets and variables → Actions → **New repository
> secret** → `API_READY_URL` = `http://<reserved-public-ip>:8000/ready`

## 7. Check it actually works

Same checklist as [DEPLOY.md §6](DEPLOY.md#6-check-it-actually-works): health
and ready both answer, the shop wall shows photographs, sign-in lands on the
console, a test order can be placed and then deleted.

---

## Afterwards

- **Rotate any key that's been in a chat window** — same advice as
  DEPLOY.md, applies here too.
- **Back up Supabase and R2** — Supabase keeps its own backups on paid plans
  only; on the free tier, that's on you. A weekly `pg_dump` from the VM (cron
  job, same idea as `docker-compose.prod.yml`'s `backup` service) and a
  weekly `rclone sync` of the R2 bucket somewhere else are both free and both
  worth doing before this holds real orders.
- **If this outgrows one VM** or you later get a domain, revisit
  [DEPLOY.md](DEPLOY.md) — Render's Starter tier removes the "you're now the
  sysadmin" trade-off for about the price of a coffee a month.
