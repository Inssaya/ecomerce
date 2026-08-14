"use client";

/**
 * Board · What to make.
 *
 * The workshop's central question, and until recently there was no screen for
 * it — `/admin/decide` had never been called from anywhere.
 *
 * The blocks are ordered by how direct the evidence is, and the order is the
 * teaching: somebody who asked for a thing by name outranks somebody who
 * searched for it, which outranks a category merely drawing attention. Read
 * top to bottom, it argues.
 *
 * Every row that names a piece opens that piece. The screen used to be a
 * dead end — it could tell you a piece was running out and give you no way
 * to reach it, which is most of the work it was supposed to save.
 */
import { useCallback } from "react";
import Link from "next/link";

import { api } from "@/lib/console/api";
import { useConsoleQuery } from "@/lib/console/query";

import { BoardStrip, useBoardQuery } from "../BoardControls";
import { Confidence, RangedDots, RankedBars, Runway, rangesAreDegenerate } from "../ui/charts";
import {
  Age,
  Card,
  CardHead,
  Clamp,
  DataTable,
  EmptyState,
  LoadError,
  MicroBar,
  Money,
  Num,
  Pill,
  Skeleton,
  Stale,
  Stat,
  Text,
  useTableSort,
  type Column,
} from "../ui/primitives";

/**
 * Where a piece is worked on. Rows link here, not to the public page — the
 * question this screen asks is "should I make more of this".
 *
 * Always via `next/link`: a raw `<a href>` inside the console is a full
 * document reload, which throws away the query cache and re-runs sign-in
 * detection to arrive at the page it was already on.
 */
const inspect = (productId: string) => `/admin/manage?open=${productId}`;

function PieceLink({ productId, title }: { productId: string | null; title: string }) {
  if (!productId) return <Text>{title}</Text>;
  return (
    <Link href={inspect(productId)} className="console-link">
      <Text>{title}</Text>
    </Link>
  );
}

export default function WhatToMake() {
  const query = useBoardQuery();

  const decide = useConsoleQuery(`decide:${query.key}`, useCallback(() => api.decide(query.range), [query.range]));
  const forecast = useConsoleQuery("forecast", useCallback(() => api.forecast(), []));
  const waiting = useConsoleQuery("waiting", useCallback(() => api.waiting(), []));
  // 200 rather than the default: the per-piece table below is the whole
  // catalogue, and a silent truncation at 60 would hide the tail that this
  // screen exists to find.
  const analytics = useConsoleQuery(`analytics:${query.key}`, useCallback(() => api.analytics(query.range, 200), [query.range]));

  const searchedNothing = analytics.data?.unmet.searched_and_found_nothing ?? [];
  const asked = decide.data?.demand.people_asked_us_to_make ?? [];
  const categories = decide.data?.demand.categories_earning_attention ?? [];
  const bestSellers = decide.data?.best_sellers.pieces ?? [];
  const rows = forecast.data?.items.filter((row) => row.expected > 0) ?? [];
  const horizon = forecast.data?.horizon_days ?? 7;

  // Nothing has sold yet, so every row is guesswork from attention. Say it
  // once, at the top — not as forty-eight identical confidence badges.
  const allLowConfidence = rows.length > 0 && rows.every((row) => row.confidence === "low");

  return (
    <>
      <BoardStrip view="make" />

      {decide.error && !decide.data ? <LoadError message={decide.error} onRetry={decide.reload} /> : null}
      {decide.loading ? <Skeleton height={260} /> : null}

      {decide.data ? (
        <Stale stale={decide.stale}>
          <div className="console-stack">
            {/* ── The evidence, most direct first ─────────────────────────── */}
            <Card>
              <CardHead title="Asked for by name" sub="Someone typed what they wanted. The most direct evidence there is." />
              {asked.length === 0 ? (
                <p className="console-muted">Nobody has asked for anything yet.</p>
              ) : (
                <ul className="console-stack-sm">
                  {asked.slice(0, 8).map((description, index) => (
                    <li key={index} style={{ fontSize: "var(--t-md)", lineHeight: 1.6 }}>
                      <Clamp>{description}</Clamp>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead title="Waiting on a piece" sub="Would have paid, for a real piece, at a price they had already seen." />
              {(waiting.data ?? []).length === 0 ? (
                <p className="console-muted">Nobody is waiting on a sold-out piece.</p>
              ) : (
                <ul className="console-stack-sm">
                  {(waiting.data ?? []).map((row) => (
                    <li key={row.product_id} className="console-row-between" style={{ fontSize: "var(--t-md)" }}>
                      <PieceLink productId={row.product_id} title={row.title} />
                      <span className="console-row" style={{ gap: 10 }}>
                        {/* How long they have waited is the difference between
                            "make it soon" and "you are losing this sale". The
                            server has always computed it; nothing showed it. */}
                        {row.since ? (
                          <span className="console-muted">
                            oldest <Age iso={row.since} />
                          </span>
                        ) : null}
                        <Pill tone={row.waiting > 2 ? "warning" : "neutral"}>
                          {row.waiting} {row.waiting === 1 ? "person" : "people"}
                        </Pill>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead title="Searched, found nothing" sub="Came here wanting a specific thing, and left." />
              {searchedNothing.length === 0 ? (
                <p className="console-muted">Every search found something.</p>
              ) : (
                <ul className="console-stack-sm">
                  {searchedNothing.slice(0, 10).map((row) => (
                    <li key={row.query} className="console-row-between" style={{ fontSize: "var(--t-md)" }}>
                      <Text>&ldquo;{row.query}&rdquo;</Text>
                      <span className="console-muted console-num">{row.people}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead title="Categories earning attention" sub="The weakest of the four signals — it says interest, not intent." />
              {categories.length === 0 ? (
                <p className="console-muted">Not enough browsing yet.</p>
              ) : (
                <RankedBars rows={categories.slice(0, 8).map((row) => ({ label: row.category, value: Math.round(row.score) }))} />
              )}
            </Card>

            {/* "Running out" and "Not moving" used to sit here. Both counted
                pieces on a shelf, and this shop keeps no stock — so every
                product reported none left and the pair said the catalogue was
                empty. What is worth making is answered by demand above and by
                what actually sells below. */}

            {/* ── The next N days ─────────────────────────────────────────── */}
            {forecast.data ? (
              <Card>
                <CardHead
                  title={`Next ${horizon} days`}
                  sub={`From the last ${forecast.data.based_on_days} days, recent days weighted far more. A calculation, not a prediction — the range is the part that matters.`}
                />

                <div className="console-stat-grid cols-3">
                  <Stat label="Pieces expected" value={<Num value={Math.round(forecast.data.expected_units)} />} caption={`over ${horizon} days`} />
                  <Stat label="If it lands" value={<Money value={forecast.data.expected_revenue} />} />
                  <Stat label="Need making" value={<Num value={forecast.data.make_now.length} />} caption="won't cover the week" />
                </div>

                {allLowConfidence ? (
                  <p className="console-note">
                    Nothing has sold yet, so these come from attention rather than sales. Treat them as a direction, not a number.
                  </p>
                ) : null}

                {forecast.data.make_now.length > 0 ? (
                  <>
                    <p className="console-caps">Make these now</p>
                    <RankedBars
                      tone="status"
                      rows={forecast.data.make_now.map((row) => ({
                        label: row.title,
                        value: row.make,
                        href: inspect(row.product_id),
                        tone: "warn" as const,
                      }))}
                      formatValue={(value) => <span>+{value}</span>}
                    />
                  </>
                ) : null}

                <p className="console-caps">How long the shelf lasts</p>
                <Runway rows={rows.map((row) => ({ label: row.title, days: row.days_of_cover, href: inspect(row.product_id) }))} />

                <p className="console-caps">Expected, with its range</p>
                {rows.length === 0 ? (
                  <EmptyState title="Not enough has sold yet to say." />
                ) : rangesAreDegenerate(rows.map((row) => ({ low: row.range[0], high: row.range[1] }))) ? (
                  // Every whisker the same length draws a chart that says nothing.
                  <ul className="console-stack-sm">
                    {rows.slice(0, 12).map((row) => (
                      <li key={row.product_id} className="console-row-between" style={{ fontSize: "var(--t-md)" }}>
                        <PieceLink productId={row.product_id} title={row.title} />
                        <span className="console-muted console-num">
                          {row.range[0]}–{row.range[1]}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <RangedDots
                    rows={rows.slice(0, 14).map((row) => ({
                      label: row.title,
                      expected: row.expected,
                      low: row.range[0],
                      high: row.range[1],
                      note: row.because,
                      href: inspect(row.product_id),
                    }))}
                  />
                )}

                {rows.length > 0 ? (
                  <details>
                    <summary className="console-caps" style={{ cursor: "pointer" }}>
                      Why each number says what it says
                    </summary>
                    <ul className="console-stack-sm" style={{ marginTop: 10 }}>
                      {rows.slice(0, 14).map((row) => (
                        <li key={row.product_id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                          <div className="console-row-between">
                            <span className="console-strong">
                              <PieceLink productId={row.product_id} title={row.title} />
                            </span>
                            <Confidence level={row.confidence} />
                          </div>
                          <p className="console-muted" style={{ lineHeight: 1.6 }}>
                            {row.because}
                            {row.days_of_cover !== null ? ` · runs out in about ${Math.round(row.days_of_cover)} days` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Card>
            ) : forecast.loading ? (
              <Skeleton height={200} />
            ) : null}

            {/* ── The counterweight ───────────────────────────────────────── */}
            <BestSellers rows={bestSellers} period={query.label} />

            {/* ── The two tables that were fetched and thrown away ────────── */}
            <PieceLeaderboard rows={analytics.data?.products.items ?? []} loading={analytics.loading} period={query.label} />
            <PagePerformance rows={analytics.data?.pages.items ?? []} loading={analytics.loading} period={query.label} />
          </div>
        </Stale>
      ) : null}
    </>
  );
}

// ── What is actually selling ─────────────────────────────────────────────────

/**
 * Units and revenue in one table with their own micro-bars, never a dual
 * axis — two scales on one axis invent a correlation the data does not have.
 * The disagreement between the two columns is the finding.
 */
function BestSellers({ rows, period }: { rows: { title: string; sold: number; revenue_mad: number; product_id: string | null }[]; period: string }) {
  const { sorted, sort, onSort } = useTableSort(
    rows,
    { title: (row) => row.title, sold: (row) => row.sold, revenue: (row) => row.revenue_mad },
    { key: "revenue", asc: false },
  );

  const mostSold = Math.max(...rows.map((row) => row.sold), 1);
  const mostRevenue = Math.max(...rows.map((row) => row.revenue_mad), 1);

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "title",
      header: "Piece",
      sortable: true,
      render: (row) => <PieceLink productId={row.product_id} title={row.title} />,
    },
    {
      key: "sold",
      header: "Sold",
      align: "right",
      sortable: true,
      width: 120,
      render: (row) => (
        <MicroBar value={row.sold} of={mostSold}>
          <Num value={row.sold} />
        </MicroBar>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortable: true,
      width: 150,
      render: (row) => (
        <MicroBar value={row.revenue_mad} of={mostRevenue}>
          <Money value={row.revenue_mad} />
        </MicroBar>
      ),
    },
  ];

  return (
    <Card>
      <CardHead
        title="What is actually selling"
        sub="Units and money disagree more often than you would think — that disagreement is the point."
      />
      <DataTable
        columns={columns}
        rows={sorted}
        rowKey={(row) => row.title}
        sort={sort}
        onSort={onSort}
        minWidth={480}
        empty={<EmptyState title="Nothing delivered yet." hint={`Nothing was delivered across ${period}.`} />}
      />
    </Card>
  );
}

// ── Per-piece leaderboard ────────────────────────────────────────────────────

/**
 * Forty-eight pieces across five measures. Past roughly seven series a table
 * beats a chart, so this is a table — with micro-bars, which give the column
 * the comparability a chart would have without pretending to be one.
 *
 * The API branch behind this has been fetched on every load of this screen
 * and rendered nowhere. Reaching one piece's numbers meant three levels of
 * disclosure and a refetch per piece.
 */
function PieceLeaderboard({
  rows,
  loading,
  period,
}: {
  rows: {
    product_id: string;
    title: string;
    saw: number;
    opened: number;
    opened_pct: number;
    avg_seconds: number;
    added: number;
    bought: number;
    bought_pct: number;
  }[];
  loading: boolean;
  period: string;
}) {
  const { sorted, sort, onSort } = useTableSort(
    rows,
    {
      title: (row) => row.title,
      saw: (row) => row.saw,
      opened: (row) => row.opened,
      opened_pct: (row) => row.opened_pct,
      avg_seconds: (row) => row.avg_seconds,
      added: (row) => row.added,
      bought: (row) => row.bought,
    },
    { key: "saw", asc: false },
  );

  const most = {
    saw: Math.max(...rows.map((row) => row.saw), 1),
    opened: Math.max(...rows.map((row) => row.opened), 1),
    added: Math.max(...rows.map((row) => row.added), 1),
    bought: Math.max(...rows.map((row) => row.bought), 1),
  };

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: "title",
      header: "Piece",
      sortable: true,
      render: (row) => <PieceLink productId={row.product_id} title={row.title} />,
    },
    { key: "saw", header: "Saw", align: "right", sortable: true, width: 110, render: (row) => <MicroBar value={row.saw} of={most.saw}><Num value={row.saw} /></MicroBar> },
    { key: "opened", header: "Opened", align: "right", sortable: true, width: 110, render: (row) => <MicroBar value={row.opened} of={most.opened}><Num value={row.opened} /></MicroBar> },
    { key: "opened_pct", header: "Open rate", align: "right", sortable: true, width: 100, render: (row) => <span className="console-num">{row.opened_pct}%</span> },
    { key: "avg_seconds", header: "Stayed", align: "right", sortable: true, width: 90, render: (row) => <span className="console-num">{row.avg_seconds ? `${Math.round(row.avg_seconds)}s` : "—"}</span> },
    { key: "added", header: "Carted", align: "right", sortable: true, width: 110, render: (row) => <MicroBar value={row.added} of={most.added}><Num value={row.added} /></MicroBar> },
    { key: "bought", header: "Bought", align: "right", sortable: true, width: 110, render: (row) => <MicroBar value={row.bought} of={most.bought}><Num value={row.bought} /></MicroBar> },
  ];

  return (
    <Card>
      <CardHead
        title="Every piece, side by side"
        sub="Seen, opened, kept attention, carted, bought. A piece many people see and few open has a photo problem, not a demand problem."
      />
      {loading && rows.length === 0 ? (
        <Skeleton height={220} />
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(row) => row.product_id}
          sort={sort}
          onSort={onSort}
          minWidth={860}
          empty={<EmptyState title="No browsing recorded." hint={`Nothing was recorded across ${period}.`} />}
        />
      )}
    </Card>
  );
}

// ── Page performance ─────────────────────────────────────────────────────────

/** The other branch fetched here every load and drawn nowhere. */
function PagePerformance({
  rows,
  loading,
  period,
}: {
  rows: { path: string; people: number; scrolled: number; scrolled_pct: number; avg_seconds: number; acted: number; acted_pct: number }[];
  loading: boolean;
  period: string;
}) {
  const { sorted, sort, onSort } = useTableSort(
    rows,
    {
      path: (row) => row.path,
      people: (row) => row.people,
      scrolled_pct: (row) => row.scrolled_pct,
      avg_seconds: (row) => row.avg_seconds,
      acted_pct: (row) => row.acted_pct,
    },
    { key: "people", asc: false },
  );

  const mostPeople = Math.max(...rows.map((row) => row.people), 1);

  const columns: Column<(typeof rows)[number]>[] = [
    { key: "path", header: "Page", sortable: true, render: (row) => <span className="console-num">{row.path}</span> },
    { key: "people", header: "People", align: "right", sortable: true, width: 120, render: (row) => <MicroBar value={row.people} of={mostPeople}><Num value={row.people} /></MicroBar> },
    { key: "scrolled_pct", header: "Scrolled", align: "right", sortable: true, width: 100, render: (row) => <span className="console-num">{row.scrolled_pct}%</span> },
    { key: "avg_seconds", header: "Stayed", align: "right", sortable: true, width: 90, render: (row) => <span className="console-num">{row.avg_seconds ? `${Math.round(row.avg_seconds)}s` : "—"}</span> },
    { key: "acted_pct", header: "Did something", align: "right", sortable: true, width: 130, render: (row) => <span className="console-num">{row.acted_pct}%</span> },
  ];

  return (
    <Card>
      <CardHead title="Which pages do the work" sub="A page many people reach and nobody acts on is the cheapest thing on this screen to fix." />
      {loading && rows.length === 0 ? (
        <Skeleton height={200} />
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(row) => row.path}
          sort={sort}
          onSort={onSort}
          minWidth={680}
          empty={<EmptyState title="No page views recorded." hint={`Nothing was recorded across ${period}.`} />}
        />
      )}
    </Card>
  );
}
