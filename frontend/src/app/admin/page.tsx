"use client";

/**
 * The Board — the first thing the owner sees, and until now the only screen
 * that rendered nothing at all.
 *
 * `/api/admin/today` has computed every figure on this page since long before
 * there was a page: the lead sentence, the queue, the pulse, revenue with a
 * thirty-day series, refusals against their target, the funnel. Nothing here
 * is a new metric. One fetch, already typed, that no screen had ever called.
 *
 * The order is the argument. A shop owner opening this at seven in the
 * morning is not asking "what was revenue" — they are asking *what needs me
 * today*, and a board that opens with a money figure answers a question they
 * did not ask. So: the queue first, because those are the four numbers that
 * turn into work; then refusals, because on cash on delivery a refused parcel
 * is the one number that quietly decides whether the shop makes money; then
 * the money itself, with its trend; then the funnel, which is diagnosis
 * rather than instruction.
 *
 * Every queue tile is a link. A count that tells you three quotes are waiting
 * and then makes you find them yourself is a worse screen than no count.
 */
import { useCallback, useState } from "react";

import { api, type Range } from "@/lib/console/api";
import { useConsoleQuery } from "@/lib/console/query";
import { money } from "@/lib/i18n";

import { Funnel, Meter, TrendArea } from "./ui/charts";
import {
  Card,
  CardHead,
  ConsoleHeader,
  DateRangeFilter,
  HelpToggle,
  LoadError,
  Num,
  Skeleton,
  Stale,
  Stat,
  type DateRange,
} from "./ui/primitives";

/** The last thirty days, which is what the server assumes when asked for none. */
function lastThirtyDays(): Range {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86_400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function Board() {
  const [range, setRange] = useState<DateRange | null>(null);

  // The two strings are the dependency, not the object: `lastThirtyDays()`
  // returns a fresh one on every render, so depending on the object itself
  // would refetch forever. Rebuilding it inside the callback from the two
  // primitives keeps the hook's declared dependencies true.
  const from = range?.from ?? lastThirtyDays().from;
  const to = range?.to ?? lastThirtyDays().to;
  const period = { from, to };

  const board = useConsoleQuery(
    `today:${from}:${to}`,
    useCallback(() => api.today({ from, to }), [from, to]),
  );

  const [explaining, setExplaining] = useState<string | null>(null);
  const explain = (metric: string) => {
    const text = board.data?.explain?.[metric];
    if (!text) return undefined;
    return (
      <HelpToggle
        open={explaining === metric}
        onToggle={() => setExplaining(explaining === metric ? null : metric)}
        label={explaining === metric ? text : "What is this?"}
      />
    );
  };

  return (
    <>
      <ConsoleHeader
        pages={[]}
        filters={<DateRangeFilter value={range} onChange={setRange} ariaLabel="Which days" />}
      />

      {board.error ? <LoadError message={board.error} onRetry={board.reload} /> : null}
      {!board.data && !board.error ? <Skeleton height={520} /> : null}

      {board.data ? (
        <Stale stale={board.stale}>
          <div className="console-stack">
            {/* The server picks this, and it is the one thing on the page
                written in words rather than figures — it says what today is
                about before any number has to be interpreted. The value and
                the sentence are one sentence ("3" + "people are waiting on a
                price."), so they are set on one line: split across two blocks
                the number reads as a statistic and the sentence reads as a
                fragment, and neither says the thing. */}
            <Card>
              <p className="console-hero">
                {board.data.lead.value}{" "}
                <span className="console-lead-tail">{board.data.lead.sentence}</span>
              </p>
            </Card>

            <Card>
              <CardHead title="What needs you" sub="Today" />
              <div className="console-stat-grid cols-4">
                <Stat
                  label="To confirm"
                  value={<Num value={board.data.queue.to_confirm} />}
                  caption="New orders, uncalled"
                  href="/admin/orders?status=placed"
                />
                <Stat
                  label="Quotes to send"
                  value={<Num value={board.data.queue.quotes_to_send} />}
                  caption="Someone is waiting on a price"
                  href="/admin/orders/commissions"
                />
                <Stat
                  label="Unread messages"
                  value={<Num value={board.data.queue.unread_messages} />}
                  href="/admin/orders/messages"
                />
                <Stat
                  label="Open orders"
                  value={<Num value={board.data.queue.open_orders} />}
                  caption="Not yet delivered"
                  href="/admin/orders"
                />
              </div>
            </Card>

            <div className="console-grid console-grid-2" style={{ alignItems: "start" }}>
              {/* Refusals earn their place above revenue. Every refused parcel
                  on cash on delivery costs the courier fee twice and returns
                  nothing — it is the metric that decides whether the shop is
                  profitable, and it is invisible in a revenue figure. */}
              <Card>
                <CardHead title="Refused at the door" sub={`${period.from} → ${period.to}`} />
                <Meter
                  value={board.data.refusals.refusal_rate_pct}
                  target={board.data.refusals.target_pct}
                  denominator={board.data.refusals.delivered_or_attempted}
                  lowerIsBetter
                  caption={
                    <>
                      {board.data.refusals.refused} refused of{" "}
                      {board.data.refusals.delivered_or_attempted} that reached a door · target{" "}
                      {board.data.refusals.target_pct}%
                    </>
                  }
                />
                {board.data.refusals.worst_cities.length > 0 ? (
                  <ul className="console-stack-sm" style={{ marginTop: "var(--space-3)" }}>
                    {board.data.refusals.worst_cities.slice(0, 5).map((city) => (
                      <li key={city.city} className="console-row-between">
                        <span>{city.city}</span>
                        <span className="console-num console-muted">
                          {city.refused} of {city.attempted}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {explain("refusals")}
              </Card>

              <Card>
                <CardHead title="Collected" sub={`${period.from} → ${period.to}`} />
                <div className="console-stat-grid cols-3">
                  <Stat
                    label="Collected"
                    value={money(board.data.revenue.collected_mad, "en")}
                    delta={{ value: board.data.revenue.change_mad, suffix: " MAD" }}
                    caption="Cash actually taken"
                  />
                  <Stat
                    label="Delivered"
                    value={<Num value={board.data.revenue.orders_delivered} />}
                    caption={`${board.data.revenue.previous_period.orders_delivered} the period before`}
                  />
                  <Stat
                    label="Average order"
                    value={money(board.data.revenue.average_order_mad, "en")}
                  />
                </div>
                <TrendArea
                  points={board.data.revenue.daily.map((day) => ({
                    date: day.date,
                    value: day.mad,
                  }))}
                  label="Collected, each day"
                  format={(value) => money(value, "en")}
                />
                {explain("revenue")}
              </Card>
            </div>

            <div className="console-grid console-grid-2" style={{ alignItems: "start" }}>
              <Card>
                <CardHead title="Today" sub={board.data.pulse.date} />
                <div className="console-stat-grid cols-3">
                  <Stat label="Orders" value={<Num value={board.data.pulse.orders_today} />} />
                  <Stat
                    label="Collected"
                    value={money(board.data.pulse.collected_today_mad, "en")}
                  />
                  <Stat label="Visitors" value={<Num value={board.data.pulse.visitors_today} />} />
                </div>
              </Card>

              <Card>
                <CardHead title="Who came" sub={`${period.from} → ${period.to}`} />
                <div className="console-stat-grid cols-3">
                  <Stat label="Visitors" value={<Num value={board.data.audience.visitors} />} />
                  <Stat
                    label="Came back"
                    value={`${board.data.audience.returning_pct}%`}
                    caption={`${board.data.audience.returning} of them`}
                  />
                  <Stat
                    label="Visitor → order"
                    value={`${board.data.conversion.visitor_to_order_pct}%`}
                    caption={`${board.data.conversion.orders_placed} orders`}
                  />
                </div>
                {explain("conversion")}
              </Card>
            </div>

            <Card>
              <CardHead title="Where people stop" sub={`${period.from} → ${period.to}`} />
              <Funnel steps={board.data.funnel.steps} />
              {explain("funnel")}
            </Card>
          </div>
        </Stale>
      ) : null}
    </>
  );
}
