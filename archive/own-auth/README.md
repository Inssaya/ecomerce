# M-StyLe's own authentication — kept for reuse

A complete, working, self-hosted auth stack, copied out of the shop on
2026-09-09 so it can be lifted into another project. Nothing here is wired
into M-StyLe any more once the Supabase migration lands; until then these are
**copies**, and the live files are still the ones under `backend/app` and
`frontend/src`.

## What it does

- Email + password, hashed with **bcrypt** via `passlib`.
- **JWT** access tokens (1 hour) and refresh tokens (30 days), signed with
  `python-jose`. Refresh tokens are rotated on use and revocable server-side,
  so signing out actually ends the session rather than only clearing the tab.
- Password reset by emailed one-hour link, which never reveals whether an
  address exists.
- Two roles, `owner` and `customer`, enforced by a FastAPI dependency.
- No third-party service, no network call: it runs entirely against the
  application's own Postgres.

## The files

| Path | What it is |
|---|---|
| `backend/modules_auth/routes.py` | register, login, refresh, logout, forgot/reset password, change password, `/auth/me` |
| `backend/modules_auth/service.py` | the actual logic behind those |
| `backend/modules_auth/schemas.py` | request/response models, including the ≥8-character password rule |
| `backend/core/security.py` | hashing, token minting, token decoding |
| `backend/core/deps.py` | `CurrentUser`, `OptionalUser`, `Owner` — how a route says who may call it |
| `backend/models/user.py` | the `User` row |
| `backend/tests/` | `test_auth_flows.py` and `test_access_control.py`, which pass |
| `frontend/lib/session.ts` | the client surface: `signIn`, `signUp`, `useSession` |
| `frontend/lib/session-store.ts` | where the session is kept, React-free so `lib/api.ts` can import it |
| `frontend/lib/auth.ts` | the console's authed transport: single-flight refresh, replay-on-401 |
| `frontend/lib/fingerprint.ts` | anonymous visitor id, with the non-secure-context fallback |
| `frontend/account/` | the sign-in / sign-up / profile / reset pages |

## To lift it into another project

1. Copy `backend/modules_auth/` to `app/modules/auth/`, `core/security.py` and
   `core/deps.py` to `app/core/`, and `models/user.py` to `app/models/`.
2. Mount the router, and set `JWT_SECRET`, `ACCESS_TOKEN_MINUTES` and
   `REFRESH_TOKEN_DAYS` in config.
3. Password reset needs an SMTP sender — the shop's lives in
   `app/modules/notify/email.py` and is **not** copied here, because it is
   shop-specific. Swap in whatever the new project uses.
4. On the frontend, `session-store.ts` and `session.ts` are standalone;
   `auth.ts` expects a `/api` prefix and the same refresh endpoint.

## Two things to keep in mind

- `Session.role` is what tells an owner from a customer after sign-in. Storing
  it is what let the shop drop a second, separate admin login page.
- `fingerprint.ts` guards `crypto.subtle`, which does not exist outside a
  secure context. Without that guard every API call fails on a plain-HTTP
  origin, because the visitor id is attached to all of them.
