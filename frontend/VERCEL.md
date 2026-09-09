# Deploying the storefront on Vercel

`vercel.json` here is short on purpose. Almost everything Vercel needs to know
is already in `next.config.ts`, which Vercel reads natively — and keeping it
there means it also holds when the app runs anywhere else.

## What is in `vercel.json`, and why only this

| Key | Why it cannot live in `next.config.ts` |
|---|---|
| `framework` | Read before the build to pick the toolchain. Auto-detected anyway; stated so a stray file at the repo root can never change the answer. |
| `regions` | Where the serverless functions run, which is a Vercel concept. Pinned to **`fra1` (Frankfurt)** to sit beside Supabase `eu-central` and the API — server components fetch the API on every render, and a US region would put an Atlantic round trip in front of each one, for visitors in Morocco. |

Everything else — rewrites, redirects, security headers, image hosts — is in
`next.config.ts` deliberately. It is application behaviour, not hosting
configuration, and duplicating it here would create two places to change and
one of them to forget.

## Set the Root Directory to `frontend`

In Project Settings → General. Without it Vercel looks for a Next app at the
repository root, finds `backend/` and `infra/` instead, and the build fails
with nothing obviously wrong.

## "Multiple services" on Vercel

There is no way to run the FastAPI backend here as it stands, and it is worth
knowing exactly why before trying.

A Vercel project builds **one** application. A monorepo with several apps
becomes several projects, each with its own Root Directory — not one project
with several services. The legacy `builds` array in `vercel.json` can put more
than one builder in a single deployment, but what it produces are still
serverless functions, not a long-lived server, and using it switches off
framework detection and the Root Directory setting.

The blocker for this app is concrete: **Vercel caps a serverless function's
request body at 4.5 MB.** The shop accepts product photographs up to 12 MB and
custom-request references up to 8 MB. Those uploads cannot arrive.

That is fixable, and the fix is a better design than the one it replaces —
have the browser upload straight to R2 with a presigned URL, so a 12 MB
photograph never travels through the API at all. It is real work rather than a
setting, and until it is done the API belongs on a host that runs the
container: `render.yaml` at the repository root, or the `docker-compose.prod.yml`
already set up for a single VPS.

See `docs/DEPLOY.md` for the full walkthrough.
