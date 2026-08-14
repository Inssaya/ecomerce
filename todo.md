# Deferred — not built, not forgotten

Two ideas from `requirementMOdification.md` that are genuinely good and were
deliberately not built during the four-session console rebuild (see
`GLOBAL-PLAN.md`), plus the follow-ups the build itself surfaced.

---

## 1. Feed — auto-rotating statistical cohorts

The owner's own words: five behavioural stats, rotated week by week, with a
20% bucket for each so the feed can tell which one a given week's behaviour
looks most like — "how do we know the champion" without pretending it is a
prediction, just an analytic read of behaviour after the fact.

Shape, as described:
- Pick five candidate behavioural models.
- Split incoming visitors 20% to each, one week at a time.
- The first week is quiet by nature — nothing to compare yet — so it does not
  try to declare a winner.
- After that, a predictive layer (Weibull survival, or a small ML model) on
  top, forecasting the next 7 days of visitors.

**The complication the owner flagged directly:** running ads changes visitor
behaviour enough to make the model "hallucinate" — a spike or a shape shift
that has nothing to do with which cohort model is winning. The fix the owner
proposed: declare ad-spend periods explicitly (a start/end the admin enters
after buying reach), so the model can tell "this week's shape changed because
of the campaign" apart from "this week's shape changed because cohort 3 is
actually better." That declaration is itself a small feature — a page or a
field where the owner marks "ads ran from X to Y" — and belongs to this
todo, not to the Feed page as it exists today.

Lives in `admin/manage/feed/page.tsx` when it is built. Nothing in the
current Feed page needs to change to make room for it.

---

## 2. Data door — incremental backup

The owner does not want sixty daily database dumps. The idea, in the owner's
words: one backup that gets modified automatically, where new information is
*pushed* into it as a set of queries rather than the whole database being
re-exported every night.

Roughly: a single backup artifact (file, or a low-cost storage target) that a
daily job updates by diffing what changed since the last run and appending
that as replayable statements, instead of a full `pg_dump` per day. The
mechanism needs its own design pass — what "diff" means for this schema,
how far back replay has to reach, what a restore actually looks like — before
it is worth a migration or a scheduled job.

No door exists for this yet. The owner's spec calls it "Data", as a fifth
area inside Manage alongside Products/Customers/Feed — not a rail door of
its own.

---

## 3. Follow-ups the rebuild itself surfaced

- **Drop `ProductVariant` from the schema.** It left the console UI in
  session 1 (replaced by `ProductAttribute`) but stays in the database
  because live order lines still reference it. Retire it once no open order
  points at one — a query to confirm that, then a migration.
- **`Piece` / shelf availability tracking.** The shop does not count stock
  (session 1's no-stock correction) — the `pieces` table and `PieceState`
  stay for the same reason as `ProductVariant`: history has to keep reading
  correctly. Same retirement condition.
- **`PieceAlert` (the sold-out waitlist).** Nothing publishes a sold-out
  state any more, so "tell me when you make more" has no way to trigger. It
  is dead code, not broken code — worth removing in the same pass as the two
  items above rather than on its own.
- **`promised_for` in the order-status email copy.** The tracking page shows
  the countdown; the email that links to it does not repeat it inline. Small,
  optional, deferred in session 3 for being more churn than the session
  needed.
- **Real WhatsApp Business API auto-send.** Every order and request still
  uses a one-tap `wa.me` click-to-chat link. A real API integration is a
  distinct, larger piece of work.
- **Dashboard density.** The owner has said the Board is "pretty good but
  very dense with non-useful information." Out of scope for this rebuild,
  worth a pass on its own.

---

## 4. Ideas recorded before this rebuild, still just ideas

Carried over from repo memory rather than duplicated there:

- **Maker/reseller benefits program.** Someone makes a piece, M-Style sells
  it for them, and they get a benefit for each customer they bring to the
  site. No mechanism, payout structure, or eligibility rule has been decided
  — this is a brief, not a spec.
