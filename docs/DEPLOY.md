# Putting M-StyLe online

Four services, each doing the one thing it is good at.

| Piece | Where | Why there |
|---|---|---|
| Storefront + console (Next.js) | **Vercel** | What Vercel is built for. |
| API (FastAPI) | **Render** | Long-lived process. See below. |
| Database + accounts | **Supabase** | Postgres you do not have to run, and it already holds the accounts. |
| Photographs | **Cloudflare R2** | No egress fees, and S3-compatible so the existing code talks to it unchanged. |
| Cache, rate limits | **Render Redis** | Beside the API, so the round trip is inside one network. |

---

## Read this before you start: Vercel cannot host the API

Vercel runs the **storefront**. It cannot sensibly run the FastAPI backend,
and it is worth being clear why rather than discovering it after a day of
configuration.

Vercel functions are serverless: each request may start a fresh process that
is frozen or discarded afterwards. The API is the opposite shape.

1. **The connection pool.** SQLAlchemy holds a pool of Postgres connections
   and reuses them. Serverless gives every concurrent invocation its own
   process, so the pool degrades into one-connection-per-request and a burst
   of traffic exhausts the database's connection limit. This is the one that
   actually takes the shop down.
2. **Migrations run before serving.** `entrypoint.sh` runs `alembic upgrade
   head` and *refuses to start* if it fails — deliberately, so a half-migrated
   schema never takes an order it cannot fulfil. There is no equivalent hook
   in a function.
3. **Redis.** Rate limiting and the security-alert debounce need a client that
   outlives one request.
4. **Timeouts.** Image upload and the owner's copilot both exceed the function
   limits on the free and hobby tiers.

Render runs the container that already exists, migrations and all. Railway or
Fly.io would do equally well; the steps below assume Render because it is the
one already discussed.

---

## What you need before you begin

- The repository on GitHub (already there: `Inssaya/ecomerce`).
- A Supabase project — you have one: `fgcpkisqeczqtbrkeclz`.
- A Cloudflare R2 bucket — you have one: `ecomerce`.
- An SMTP sender. Gmail works for testing; for a real shop use a service that
  signs your domain (Resend, Brevo, Postmark), or order emails land in spam
  and a customer who never sees "your parcel is coming" refuses it at the door.

---

## 1. Supabase — the database

**a. Turn off email confirmation** (or the first sign-in cannot happen).

> Authentication → Sign In / Providers → Email → **Confirm email: off**

Buying never requires an account here, so an account only saves an address —
a confirmation step is friction on something already optional. Turn it back on
later if the shop starts holding anything worth protecting.

**b. Copy the pooled connection string.**

> Project Settings → Database → Connection string → **Transaction pooler**

It looks like:

```
postgresql://postgres.fgcpkisqeczqtbrkeclz:YOUR-PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

Two changes before you paste it anywhere:

- Replace `YOUR-PASSWORD` with the database password.
- Change the prefix to `postgresql+asyncpg://` — SQLAlchemy chooses its driver
  from that prefix, and without it the API cannot connect at all.

Use the **pooler on 6543**, not the direct 5432 endpoint. Direct connections
are a fixed, small number and a couple of deploys will use them all up.

**c. Run the migrations against it.** From this repository, once:

```sh
cd backend
DATABASE_URL='postgresql+asyncpg://…pooler…:6543/postgres' alembic upgrade head
```

Every table, and the settings singleton, appear in Supabase.

---

## 2. Cloudflare R2 — the photographs

Already done, by the API token you provided:

- Account `0371dab280e702ea81b19f71107108cd`
- Bucket `ecomerce`
- Public reads switched on: `https://pub-92123ff50fbe4dbab563974dd46aa356.r2.dev`

Verified end to end — upload through the S3 API, then fetched over plain HTTPS
with no credentials, correct `content-type`.

**Before real traffic, put a custom domain on it.** The `r2.dev` address is a
development convenience and Cloudflare rate-limits it. In R2 → your bucket →
Settings → Custom Domains, add something like `media.mostyle.ma`, then use
that as `MEDIA_ORIGIN` below.

> **A note on what is public.** Anything in this bucket can be read by anyone
> holding the URL — the same posture the old MinIO policy had. Product photos
> are public by definition; so are the reference photos customers attach to a
> custom request. Listing is *not* possible, so the keys cannot be enumerated,
> but a leaked URL is a readable file. If that becomes a problem, reference
> photos should move to a second, private bucket served through signed URLs.

---

## 3. Render — the API

**a. New → Blueprint**, point it at the repository. It reads `render.yaml` and
creates the web service and the Redis instance.

**b. Fill in the values it prompts for.** Everything marked `sync: false` is
asked once and stored by Render, never written into the repository:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the pooled Supabase string from step 1b, with `postgresql+asyncpg://` |
| `SUPABASE_URL` | `https://fgcpkisqeczqtbrkeclz.supabase.co` |
| `SUPABASE_ANON_KEY` | your `sb_publishable_…` key |
| `MINIO_ENDPOINT` | `0371dab280e702ea81b19f71107108cd.r2.cloudflarestorage.com` |
| `MINIO_ACCESS_KEY` | the R2 access key id |
| `MINIO_SECRET_KEY` | the R2 secret access key |
| `MEDIA_BUCKET` | `ecomerce` |
| `APP_URL` | the Vercel address, e.g. `https://mostyle.vercel.app` |
| `SMTP_*` | your mail sender |
| `WHATSAPP_NUMBER` | the workshop number, digits only |

`REDIS_URL` wires itself from the Redis service. `MINIO_USE_SSL` is `true`.
There is no JWT secret — Supabase signs, the API only verifies.

**c. Deploy.** The container migrates, then serves. Check the log says
`Migrating…` then `Starting the API.`, and that `https://<your-api>.onrender.com/health`
returns `{"status":"ok"}`.

> On the free tier Render sleeps an idle service, and the first request after
> that takes ~30 seconds. For a shop that is a customer watching a blank page,
> so use the paid Starter tier for the API.

---

## 4. Vercel — the storefront

**a. Import the repository**, and set **Root Directory to `frontend`**. This
is the step everything else depends on: without it Vercel looks for a Next app
at the repository root, finds none, and the build fails.

**b. Environment variables** (all three environments):

| Variable | Value | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fgcpkisqeczqtbrkeclz.supabase.co` | the browser signs in directly |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your `sb_publishable_…` key | same |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL | canonical links, OpenGraph |
| `INTERNAL_API_URL` | `https://<your-api>.onrender.com` | where `/api/*` is proxied |
| `MEDIA_ORIGIN` | `https://pub-92123ff50fbe4dbab563974dd46aa356.r2.dev` | where `/media/*` is proxied |
| `NEXT_PUBLIC_APP_NAME` | `MoStyle` | |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | the workshop number | |

The two `NEXT_PUBLIC_SUPABASE_*` are inlined into the bundle at build time.
Setting them only as runtime variables does nothing — the client falls back to
a placeholder and every sign-in fails with a refused connection. If you change
them, redeploy.

**c. Why there is no CORS configuration anywhere.** The browser only ever calls
`/api/*` and `/media/*` on its own origin; Next rewrites both server-side. So
every request is same-origin, and the API never needs to allow a foreign one.

---

## 5. Make yourself the owner

The account lives in Supabase; the *role* lives in the shop's database, so
nobody can grant themselves the console from a dashboard.

```sh
# Render → mostyle-api → Shell
python -m app.cli make-owner you@example.com
```

If you have not signed in yet, pass the Supabase user id as a second argument
and it grants the role up front.

Then sign in at `https://<your-site>/en/account` — an owner lands on the
console, everybody else on their profile.

---

## 6. Check it actually works

- `/health` on the API returns ok.
- `/ready` returns `{"database": true, "redis": true}` — this is the one that
  catches a wrong `DATABASE_URL`, because `/health` answers without touching
  either.
- The shop wall shows photographs. If they are broken, `MEDIA_ORIGIN` is
  wrong or R2 public access is off.
- Sign in, and land on the console.
- Place a test order, then delete it from Manage → Orders.

---

## Afterwards

- **Rotate the keys that have been in a chat window** — the R2 pair and the
  Supabase key. Rotating is cheap; assuming they stayed private is not.
- **Custom domain** on Vercel, and update `APP_URL` on Render to match, or
  every tracking link in every email still points at the old address.
- **Backups.** Supabase keeps its own; R2 does not, and the photographs are
  the catalogue. A weekly `rclone sync` of the bucket somewhere else is enough.
- **`MINIO_PUBLIC_ENDPOINT` is unused** and should stay unset. Stored URLs are
  relative on purpose; setting it does nothing, but it invites somebody to
  reintroduce absolute URLs and break every image on any other host.
