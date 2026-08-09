"use client";

/**
 * The screen the owner opens on.
 *
 * KPIs and graphs together, not behind a tab each — the panel is read in a
 * spare minute, and five round trips before a screen means anything is what
 * makes a dashboard feel broken. The toggle at the top swaps the same screen
 * into the Forecast: what the shop expects to sell over the next seven days,
 * from `admin/forecast.py`'s decayed-sales-rate calculation. It is a
 * calculation, not a trained model, and is never called "predictive" here.
 */
import { useEffect, useState } from "react";

import { Confidence, Funnel, Sparkline, Stat } from "@/components/charts";
import { admin, type Analytics, type Forecast, type ForecastRow, type Money, type Pulse } from "@/lib/admin/client";
import { NotSignedIn, bounceToSignIn } from "@/lib/admin/session";
import { money } from "@/lib/i18n";

export default function Dashboard() {
  const [view, setView] = useState<"kpis" | "forecast">("kpis");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-semibold tracking-tight">Dashboard</h1>
        <div className="flex gap-1 rounded-2xl bg-clay-soft p-1">
          {(["kpis", "forecast"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={`tap rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors duration-gentle ${
                view === option ? "bg-clay text-white" : "text-ink"
              }`}
            >
              {option === "kpis" ? "Today" : "Forecast"}
            </button>
          ))}
        </div>
      </div>

      {view === "kpis" ? <Kpis /> : <ForecastView />}
    </div>
  );
}

function Kpis() {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [moneyData, setMoneyData] = useState<Money | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([admin.pulse(), admin.money(), admin.analytics(30)])
      .then(([p, m, a]) => {
        if (cancelled) return;
        setPulse(p);
        setMoneyData(m);
        setAnalytics(a);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof NotSignedIn) bounceToSignIn();
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="text-[14px] text-warn">Could not load the dashboard.</p>;
  if (!pulse || !moneyData || !analytics) {
    return <div className="h-64 rounded-3xl bg-clay-soft/50 animate-pulse" aria-hidden />;
  }

  const overTarget = moneyData.refusals.refusal_rate_pct > moneyData.refusals.target_pct;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders today" value={String(pulse.orders_today)} />
        <Stat label="Collected today" value={money(pulse.collected_today_mad, "en")} />
        <Stat label="Visitors today" value={String(pulse.visitors_today)} />
        <Stat
          label="Open orders"
          value={String(pulse.open_orders)}
          note={pulse.requests_waiting_on_a_quote ? `${pulse.requests_waiting_on_a_quote} waiting on a price` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Stat
          label="Revenue (30 days)"
          value={money(moneyData.revenue.collected_mad, "en")}
          note={`${moneyData.revenue.orders_delivered} orders delivered`}
        />
        <div className={`card p-4 shadow-soft ${overTarget ? "border border-warn/40" : ""}`}>
          <p className="text-[13px] text-ink-soft">Refusal rate</p>
          <p className={`stamp mt-1 text-[24px] font-semibold ${overTarget ? "text-warn" : "text-good"}`}>
            {moneyData.refusals.refusal_rate_pct}%
          </p>
          <p className="text-[12px] text-ink-soft">
            {moneyData.refusals.refused} / {moneyData.refusals.delivered_or_attempted} · target{" "}
            {moneyData.refusals.target_pct}%
          </p>
        </div>
      </div>

      <section className="card p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold">Visitors, last 30 days</h2>
        <div className="mt-4">
          <Sparkline points={analytics.audience.daily} label="Visitors" />
        </div>
      </section>

      <section className="card p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold">Where people stop</h2>
        <div className="mt-4">
          <Funnel steps={analytics.funnel.steps} lang="en" />
        </div>
      </section>
    </div>
  );
}

function ForecastView() {
  const [data, setData] = useState<Forecast | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    admin
      .forecast()
      .then((result) => !cancelled && setData(result))
      .catch((error) => error instanceof NotSignedIn && bounceToSignIn());
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return <div className="h-64 rounded-3xl bg-clay-soft/50 animate-pulse" aria-hidden />;

  const selling = data.items.filter((row) => row.expected > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Pieces expected" value={roughly(data.expected_units)} note="over 7 days" />
        <Stat label="If it lands" value={money(data.expected_revenue, "en")} />
      </div>

      {data.make_now.length > 0 ? (
        <section className="card p-5 shadow-soft border border-warn/40">
          <h2 className="text-[16px] font-semibold">Make these now</h2>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            The shelf will not cover next week at the top of the range.
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {data.make_now.map((row) => (
              <li key={row.product_id} className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium">{row.title}</span>
                <span className="stamp text-[15px] font-semibold tabular-nums text-warn">+{row.make}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold">Piece by piece</h2>
        <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
          From the last {data.based_on_days} days, with recent days weighted far more. Tap a row for why.
        </p>
        <ul className="mt-4 flex flex-col gap-1">
          {selling.length === 0 ? (
            <p className="text-[14px] text-ink-soft">Not enough has sold yet to say.</p>
          ) : (
            selling.map((row) => (
              <ForecastRowItem
                key={row.product_id}
                row={row}
                open={open === row.product_id}
                onToggle={() => setOpen(open === row.product_id ? null : row.product_id)}
              />
            ))
          )}
        </ul>
      </section>

      <p className="px-1 text-[12.5px] text-ink-soft leading-relaxed">
        This is a calculation from the recent rate of selling, not a promise. The range is the part that matters.
      </p>
    </div>
  );
}

function ForecastRowItem({ row, open, onToggle }: { row: ForecastRow; open: boolean; onToggle: () => void }) {
  const [low, high] = row.range;
  return (
    <li className="border-t border-sand first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full py-3 text-start flex items-baseline justify-between gap-3">
        <span className="flex-1">
          <span className="block text-[15px] font-medium">{row.title}</span>
          <span className="block mt-0.5 text-[12.5px] text-ink-soft">
            {row.kind === "workshop" ? "made to order" : `${row.on_the_shelf} on the shelf`}
          </span>
        </span>
        <span className="text-end">
          <span className="block stamp text-[15px] font-semibold tabular-nums">{roughly(row.expected)}</span>
          <span className="block stamp text-[12px] tabular-nums text-ink-soft">
            {low}–{high}
          </span>
        </span>
      </button>
      {open ? (
        <div className="pb-3 flex flex-col gap-1.5">
          <p className="text-[13px] text-ink-soft leading-relaxed">{row.because}</p>
          <Confidence level={row.confidence} lang="en" />
        </div>
      ) : null}
    </li>
  );
}

function roughly(expected: number): string {
  if (expected >= 1.5) return String(Math.round(expected));
  if (expected >= 0.7) return "about 1";
  if (expected >= 0.35) return "1 per 2 weeks";
  if (expected > 0) return "less often";
  return "none expected";
}
