"use client";

/**
 * Board · Today — the briefing.
 *
 * It opens on one sentence, not on six equal tiles. The old screen showed
 * numbers and left the owner to work out which one mattered; the lead here is
 * computed server-side in the same order the problems cost money — a refusal
 * rate over target outranks a queue, a queue outranks revenue.
 *
 * The strip above scopes the screen. Narrow to a category or a piece and the
 * money, the behaviour and the funnel are about that thing. Three blocks
 * cannot narrow — the work queue, the lead and the shelf are questions about
 * the whole shop, and narrowing them would hide work rather than focus it —
 * so the server names them and they say "whole shop" out loud.
 */
import { useCallback, useState } from "react";

import { api } from "@/lib/console/api";
import { useConsoleQuery } from "@/lib/console/query";

import { BoardStrip, ShopWide, useBoardQuery } from "./BoardControls";
import { Funnel, Meter, RankedBars, Sparkline, TrendArea } from "./ui/charts";
import {
  Card,
  CardHead,
  EmptyState,
  HelpToggle,
  LoadError,
  Money,
  Num,
  Skeleton,
  Stale,
  Stat,
} from "./ui/primitives";

export default function Board() {
  const query = useBoardQuery();
  const [openHelp, setOpenHelp] = useState<string | null>(null);

  const load = useCallback(() => api.today(query.range, query.scope), [query.range, query.scope]);
  const { data, error, loading, stale, reload } = useConsoleQuery(`today:${query.key}`, load);

  const help = (key: string) =>
    data?.explain?.[key] ? (
      <HelpToggle open={openHelp === key} onToggle={() => setOpenHelp(openHelp === key ? null : key)} label={`What "${key}" means`} />
    ) : null;

  // The server decides which blocks it could not scope; the screen only
  // reports it. Deciding again here is how the two drift apart.
  const shopWide = (block: string) => Boolean(data?.scope?.shop_wide?.includes(block));

  return (
    <>
      <BoardStrip view="today" />

      {error && !data ? <LoadError message={error} onRetry={reload} /> : null}
      {loading ? <Skeleton height={280} /> : null}

      {data ? (
        <Stale stale={stale}>
          <div className="console-stack">
            {/* The lead. One sentence, before anything else. */}
            <Card>
              <div className="console-row-between">
                <p className="console-hero">
                  {data.lead.value} <span style={{ fontWeight: 400, color: "var(--ink2)" }}>{data.lead.sentence}</span>
                </p>
                <ShopWide active={shopWide("lead")} />
              </div>
            </Card>

            {/* The queue — every number goes somewhere. */}
            <div className="console-stack-sm">
              {shopWide("queue") ? (
                <div className="console-row" style={{ gap: 8 }}>
                  <span className="console-caps">What needs you</span>
                  <ShopWide active />
                  <span className="console-muted">work does not narrow — hiding it would not focus it</span>
                </div>
              ) : null}
              <div className="console-stat-grid cols-4">
                <Stat label="Open orders" value={<Num value={data.queue.open_orders} />} href="/admin/orders?status=open" caption="still moving" />
                <Stat
                  label="Quotes to send"
                  value={<Num value={data.queue.quotes_to_send} />}
                  href="/admin/orders/commissions?status=requested"
                  caption="waiting on a price"
                />
                <Stat label="Unread messages" value={<Num value={data.queue.unread_messages} />} href="/admin/orders/messages?unread=1" />
                {/* This one had no link, while the comment above claimed they all
                    did. Today's orders are the ones most likely to need confirming. */}
                <Stat
                  label="Orders today"
                  value={<Num value={data.pulse.orders_today} />}
                  href="/admin/orders?status=placed"
                  caption={<>collected <Money value={data.pulse.collected_today_mad} /></>}
                />
              </div>
            </div>

            {/* The number that decides whether the business works. */}
            <Card>
              <CardHead
                title={<span className="console-row" style={{ gap: 6 }}>Refusal rate {help("refusal_rate")}</span>}
                sub={`${data.refusals.refused} of ${data.refusals.delivered_or_attempted} parcels came back`}
              />
              <Meter
                value={data.refusals.refusal_rate_pct}
                target={data.refusals.target_pct}
                denominator={data.refusals.delivered_or_attempted}
                lowerIsBetter
              />
              {openHelp === "refusal_rate" ? <p className="console-note">{data.explain.refusal_rate}</p> : null}
              {data.refusals.worst_cities.length > 0 ? (
                <>
                  <p className="console-caps">Where they come back</p>
                  <RankedBars
                    tone="status"
                    rows={[...data.refusals.worst_cities]
                      .sort((a, b) => b.refused / Math.max(b.attempted, 1) - a.refused / Math.max(a.attempted, 1))
                      .slice(0, 6)
                      .map((city) => ({
                        label: city.city,
                        value: city.attempted ? (city.refused / city.attempted) * 100 : 0,
                        sub: `${city.refused} of ${city.attempted}`,
                        tone: "danger" as const,
                      }))}
                    formatValue={(value) => <span>{value.toFixed(0)}%</span>}
                    max={100}
                  />
                </>
              ) : null}
            </Card>

            {/* The period's money and movement. */}
            <div className="console-stat-grid cols-4">
              <Stat
                label={`Collected · ${query.short}`}
                value={<Money value={data.revenue.collected_mad} />}
                delta={{ value: data.revenue.change_mad, suffix: " MAD" }}
                caption={`${data.revenue.orders_delivered} delivered`}
              >
                {/* Only visitors had a daily series, so the shape of the money
                    itself — the thing an owner actually watches — was invisible. */}
                <Sparkline
                  points={(data.revenue.daily ?? []).map((day) => ({ date: day.date, value: day.mad }))}
                  label={`Revenue across ${query.label}`}
                />
              </Stat>
              <Stat label="Average order" value={<Money value={data.revenue.average_order_mad} />} help={help("average_order")} />
              <Stat
                label="Visitors → orders"
                // The server computes this and the screen used to compute it
                // again from two other fields. Two sources of one truth is one
                // rounding rule away from the Board contradicting the copilot.
                value={
                  data.conversion.visitors ? (
                    <span className="console-num">{data.conversion.visitor_to_order_pct}%</span>
                  ) : (
                    <span>—</span>
                  )
                }
                caption={`${data.conversion.orders_placed} of ${data.conversion.visitors}`}
                help={help("visitor_to_order")}
              />
              <Stat
                label="Returning"
                value={
                  data.audience.visitors ? <span className="console-num">{data.audience.returning_pct}%</span> : <span>—</span>
                }
                caption={`${data.audience.actions_per_visitor} actions each`}
              />
            </div>

            {openHelp && openHelp !== "refusal_rate" ? <p className="console-note">{data.explain[openHelp]}</p> : null}

            <div className="console-grid console-grid-2">
              <Card>
                <CardHead title="Visitors" sub={`${data.audience.visitors} people over ${query.label}`} />
                {data.audience.daily.length > 1 ? (
                  <TrendArea points={data.audience.daily.map((day) => ({ date: day.date, value: day.visitors }))} label="Visitors" />
                ) : (
                  <EmptyState title="Not enough days yet." hint={`Nothing was recorded across ${query.label}.`} />
                )}
              </Card>

              <Card>
                <CardHead title="Where people stop" sub="The biggest drop is the sentence worth acting on." />
                {data.funnel.steps.length ? (
                  <Funnel steps={data.funnel.steps} />
                ) : (
                  <EmptyState title="Nobody has visited yet." hint={`Nothing was recorded across ${query.label}.`} />
                )}
              </Card>
            </div>
          </div>
        </Stale>
      ) : null}
    </>
  );
}
