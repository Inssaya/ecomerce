# Session report — MoStyle rebuild

Branch: `claude/monolith-rebuild-5xzsfl`, all pushed to origin. Working tree clean.
15 commits this session. 198 backend tests, 80 frontend tests, all green as of the last push.

## Done

**Security / session (real bugs, not polish)**
- "Sign out" cleared the phone's tokens but never revoked the refresh token on the server — it stayed valid for 30 days. Fixed: `/auth/logout` is now called, and the local clear happens first regardless of network.
- The owner's access token expires hourly; nothing ever called `/auth/refresh`, so the panel dumped the owner to the sign-in screen every hour mid-task. Fixed, with single-flight protection (the panel fires several requests at once on load; refresh tokens rotate, so without this two of them would spend a dead token).
- No way to change the owner's password except the reset email (which depends on SMTP working). Added a change-password form in the panel.
- The shopping assistant's `track_order` tool took a bare 8-character reference and returned someone's order status/total/date. The public HTTP endpoint refuses exactly that (requires reference **and** phone). Assistant tool now matches.

**The feed was running on two dead weights**
- Semantic similarity (weight 0.8) was multiplied by zero because nothing ever wrote a product embedding. Now wired into publish/update.
- Category affinity — the **highest**-weighted term (1.0) — was zero for every piece because there was no UI to create or assign a category. Built: category picker on the shelf screen, category pages on the storefront (`/store/[category]`), category chips on `/store`.

**Data integrity**
- Deleting a piece off a shelf batch left the siblings still claiming the old count ("01 of 4" over 3 objects). Fixed — batch size now shrinks correctly, and it's written into BRAND.md as a rule.
- The delivery fee was hardcoded in three places (cart, checkout, server default) and none of them read the per-city override that's existed in the DB since city pages were built. Now one source of truth on the server; cart/checkout read it live.
- The piece page returned HTTP 200 with "not found" text for a deleted/archived product — a soft 404 that keeps dead products indexed. Partially fixed: proper `notFound()` + a `[lang]`-scoped not-found page (there wasn't one), and a `resource()` vs `fromApi()` split so a real 404 isn't confused with an API hiccup. **Caveat below.**

**Missing owner capability**
- Photo management: choose cover photo, delete a photo (with two-tap confirm) — previously the cover was just "whichever uploaded first," permanently.
- A piece's title/description/story/price/lead-time could never be edited after creation — only archive-and-restart, which threw away the batch, URL, and feed history. Added a full edit form; only changed fields are sent (rewriting copy re-triggers embedding, so this isn't free).
- Order search by reference/phone/name on the owner's Orders screen (API supported it, nothing called it).

**SEO (per your ChatGPT note — built the useful half, skipped the AI-blog-spam half)**
- One category page per line of work (`/store/hooks` etc.) with breadcrumb + CollectionPage schema, real hreflang, real 404 for bad slugs.
- One `/how-we-work` page, both languages hand-written (not a blog — explained why in the commit: an AI content mill is exactly what Google's helpful-content update demotes, and it contradicts this shop's own "Made, not resold" positioning).
- "More of this kind" — 4 related pieces at the foot of every piece page, server-rendered so crawlers/share previews see them.
- Assistant got an `open_category` tool so "what hooks do you have" lands on the category page instead of one piece.

**Housekeeping**
- Removed the in-app notification inbox (dead code — this shop has no signed-in customers, so `customer_id` was always null; three routes + a table deleted with a migration).
- Removed a duplicate `/admin/orders/stats/today` endpoint whose "today" field was actually all-time.
- Untracked `backend/.coverage` (binary, regenerated every run, shouldn't be in git).

## Not done / known gaps

- **The piece-page soft-404 is not fully fixed.** I measured (not guessed): a bare `notFound()` returns real 404 in this app; the piece page still returns 200 because it awaits data before deciding, and by then the response has started streaming. What actually keeps a dead piece out of Google's index is the `noindex` meta Next renders on the not-found body — I removed a conflicting `index,follow` override that was fighting it. A fully correct fix needs a slug lookup in middleware, which I didn't build (real added latency on every catalogue request, judged not worth it yet).
- **Photo upload is unverified** — no MinIO/object storage in this container, so I could exercise everything up to that boundary but not the actual upload path.
- **Docker image builds are unverified** — no Docker daemon in this container.
- No owner UI for feed weights (deliberately — six sliders with no way to measure their effect, in the hands of one person, is a control that can only be misused; the API stays reachable via curl).
- No blog / recurring content system (deliberately, see above).

## What I'd do next, if continuing

1. Run the real thing once on your machine: `docker compose --profile dev up --build`, seed the owner, upload a real photo, place a real order end-to-end. This session verified everything short of that boundary.
2. Decide on the middleware-based 404 fix for piece pages, or accept the noindex-only mitigation.
3. Point a real domain at it and go through `docs/REBUILD-PLAN.md`'s deploy checklist (`.env` values, especially `APP_URL` and `MEDIA_HOSTNAMES` — both silently break things if wrong).

Everything above is in the git history with full reasoning in each commit message — `git log --oneline` on this branch is a reasonably readable changelog on its own.
