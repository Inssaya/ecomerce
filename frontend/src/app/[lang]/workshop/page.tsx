"use client";

import { use, useCallback, useEffect, useState } from "react";

import {
  admin,
  NotSignedIn,
  ownerToken,
  setOwnerToken,
  type Decide,
  type Money,
  type Pulse,
} from "@/lib/admin";
import { type Lang, isLang, money as formatMoney } from "@/lib/i18n";

import { Live } from "./Live";
import { NextWeek } from "./NextWeek";

/**
 * The control room.
 *
 * One screen, in the order the owner actually needs it: today first, then the
 * one question a workshop really has — *what should I make next* — then the
 * money, then the assistant. Everything else is a tap away rather than a tab
 * competing for the first glance.
 */
type Tab = "today" | "live" | "next" | "decide" | "money" | "ask";

export default function Workshop({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => setSignedIn(Boolean(ownerToken())), []);

  if (signedIn === null) return <div className="page pt-10" aria-hidden />;
  if (!signedIn) return <SignIn lang={lang} onDone={() => setSignedIn(true)} />;

  return (
    <div className="page pt-6 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-semibold tracking-tight">
          {lang === "ar" ? "الورشة" : "The workshop"}
        </h1>
        <button
          type="button"
          onClick={() => {
            setOwnerToken(null);
            setSignedIn(false);
          }}
          className="tap text-[13px] text-ink-soft px-2"
        >
          {lang === "ar" ? "خروج" : "Sign out"}
        </button>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["today", lang === "ar" ? "اليوم" : "Today"],
            ["live", lang === "ar" ? "الحركة" : "Live"],
            ["next", lang === "ar" ? "الأسبوع القادم" : "Next week"],
            ["decide", lang === "ar" ? "ماذا أصنع" : "What to make"],
            ["money", lang === "ar" ? "المال" : "Money"],
            ["ask", lang === "ar" ? "اسأل" : "Ask"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`tap shrink-0 rounded-2xl px-4 text-[14px] font-medium transition-colors duration-gentle ${
              tab === key ? "bg-clay text-white" : "bg-clay-soft text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "today" ? <Today lang={lang} onExpire={() => setSignedIn(false)} /> : null}
        {tab === "live" ? <Live lang={lang} onExpire={() => setSignedIn(false)} /> : null}
        {tab === "next" ? <NextWeek lang={lang} onExpire={() => setSignedIn(false)} /> : null}
        {tab === "decide" ? <WhatToMake lang={lang} onExpire={() => setSignedIn(false)} /> : null}
        {tab === "money" ? <TheMoney lang={lang} onExpire={() => setSignedIn(false)} /> : null}
        {tab === "ask" ? <Copilot lang={lang} /> : null}
      </div>
    </div>
  );
}

function SignIn({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const form = new FormData(event.currentTarget);
    try {
      await admin.signIn(lang, String(form.get("email")), String(form.get("password")));
      onDone();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Sign in failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="page pt-16">
      <h1 className="text-[24px] font-semibold">{lang === "ar" ? "الورشة" : "The workshop"}</h1>
      <div className="mt-6 space-y-4">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@mostyle.ma"
          className="field"
        />
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
        />
      </div>
      {problem ? (
        <p role="alert" className="mt-4 text-[15px] text-warn">
          {problem}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn-primary w-full mt-6">
        {lang === "ar" ? "دخول" : "Sign in"}
      </button>
    </form>
  );
}

/** Every panel loads the same way, so the loading and expiry handling is
 *  written once rather than in each one. */
function useOwnerData<T>(load: () => Promise<T>, onExpire: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const run = useCallback(() => {
    load()
      .then(setData)
      .catch((error) => (error instanceof NotSignedIn ? onExpire() : setFailed(true)));
    // `load` is redefined every render by design — the caller closes over lang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(run, [run]);
  return { data, failed, reload: run };
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-4 shadow-soft">
      <p className="text-[13px] text-ink-soft">{label}</p>
      <p className="stamp mt-1 text-[24px] font-semibold">{value}</p>
      {note ? <p className="mt-0.5 text-[12px] text-ink-soft">{note}</p> : null}
    </div>
  );
}

function Today({ lang, onExpire }: { lang: Lang; onExpire: () => void }) {
  const { data } = useOwnerData<Pulse>(() => admin.pulse(lang), onExpire);
  if (!data) return <div className="h-40 rounded-3xl bg-clay-soft/50 animate-pulse" aria-hidden />;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Figure label={lang === "ar" ? "طلبات اليوم" : "Orders today"} value={String(data.orders_today)} />
      <Figure
        label={lang === "ar" ? "نقداً اليوم" : "Collected today"}
        value={formatMoney(data.collected_today_mad, lang)}
      />
      <Figure label={lang === "ar" ? "زوّار" : "Visitors"} value={String(data.visitors_today)} />
      <Figure
        label={lang === "ar" ? "طلبات مفتوحة" : "Open orders"}
        value={String(data.open_orders)}
        note={
          data.requests_waiting_on_a_quote
            ? lang === "ar"
              ? `${data.requests_waiting_on_a_quote} بانتظار ثمن`
              : `${data.requests_waiting_on_a_quote} waiting on a price`
            : undefined
        }
      />
    </div>
  );
}

function WhatToMake({ lang, onExpire }: { lang: Lang; onExpire: () => void }) {
  const { data } = useOwnerData<Decide>(() => admin.decide(lang), onExpire);
  if (!data) return <div className="h-40 rounded-3xl bg-clay-soft/50 animate-pulse" aria-hidden />;

  const asked = data.demand.people_asked_us_to_make;
  const searched = data.demand.searched_for;
  const runningOut = data.shelf.running_out;
  const notMoving = data.shelf.not_moving;

  return (
    <div className="space-y-5">
      <Panel title={lang === "ar" ? "طلبوا منّا أن نصنع" : "People asked us to make"}>
        {asked.length === 0 ? (
          <Empty lang={lang} />
        ) : (
          <ul className="space-y-2">
            {asked.slice(0, 8).map((text, index) => (
              <li key={index} className="text-[15px] leading-relaxed">
                {text}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={lang === "ar" ? "بحثوا عنه" : "They searched for"}>
        {searched.length === 0 ? (
          <Empty lang={lang} />
        ) : (
          <ul className="space-y-1">
            {searched.map((row) => (
              <li key={row.query} className="flex justify-between text-[15px]">
                <span>{row.query}</span>
                <span className="tabular-nums text-ink-soft">{row.times}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={lang === "ar" ? "على وشك النفاد" : "Running out"}>
        {runningOut.length === 0 ? (
          <Empty lang={lang} />
        ) : (
          <ul className="space-y-1">
            {runningOut.map((row) => (
              <li key={row.slug} className="flex justify-between text-[15px]">
                <span>{row.title}</span>
                <span className="tabular-nums text-ink-soft">{row.available}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={lang === "ar" ? "لا يتحرّك" : "Not moving"}>
        {notMoving.length === 0 ? (
          <Empty lang={lang} />
        ) : (
          <ul className="space-y-1">
            {notMoving.map((row) => (
              <li key={row.slug} className="flex justify-between text-[15px]">
                <span>{row.title}</span>
                <span className="tabular-nums text-ink-soft">{row.available}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function TheMoney({ lang, onExpire }: { lang: Lang; onExpire: () => void }) {
  const { data } = useOwnerData<Money>(() => admin.money(lang), onExpire);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  useEffect(() => {
    admin
      .explain(lang)
      .then((rows) =>
        setExplanations(Object.fromEntries(rows.map((row) => [row.name, row.explanation]))),
      )
      .catch(() => undefined);
  }, [lang]);

  if (!data) return <div className="h-40 rounded-3xl bg-clay-soft/50 animate-pulse" aria-hidden />;

  const missed = data.refusals.refusal_rate_pct;
  const overTarget = missed > data.refusals.target_pct;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Figure
          label={lang === "ar" ? "المحصّل" : "Collected"}
          value={formatMoney(data.revenue.collected_mad, lang)}
          note={`${data.revenue.orders_delivered} ${lang === "ar" ? "طلب" : "orders"}`}
        />
        <Figure
          label={lang === "ar" ? "متوسط الطلب" : "Average order"}
          value={formatMoney(data.revenue.average_order_mad, lang)}
        />
      </div>

      {/* The number that decides whether this business works. */}
      <div className={`card p-5 shadow-soft ${overTarget ? "border border-warn/40" : ""}`}>
        <p className="text-[13px] text-ink-soft">
          {lang === "ar" ? "طرود مرفوضة" : "Packages refused"}
        </p>
        <p
          className={`stamp mt-1 text-[32px] font-semibold ${overTarget ? "text-warn" : "text-good"}`}
        >
          {missed}%
        </p>
        <p className="text-[13px] text-ink-soft">
          {data.refusals.refused} / {data.refusals.delivered_or_attempted} ·{" "}
          {lang === "ar" ? "الهدف" : "target"} {data.refusals.target_pct}%
        </p>
        {explanations.refusal_rate ? (
          <p className="mt-3 text-[14px] text-ink-soft leading-relaxed">
            {explanations.refusal_rate}
          </p>
        ) : null}
        {data.refusals.worst_cities.length > 0 ? (
          <ul className="mt-4 space-y-1">
            {data.refusals.worst_cities.map((row) => (
              <li key={row.city} className="flex justify-between text-[14px]">
                <span>{row.city}</span>
                <span className="tabular-nums text-ink-soft">
                  {row.refused}/{row.attempted}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Figure
          label={lang === "ar" ? "زائر ← طلب" : "Visitor → order"}
          value={`${data.conversion.visitor_to_order_pct}%`}
        />
        <Figure
          label={lang === "ar" ? "سلة ← طلب" : "Cart → order"}
          value={`${data.conversion.cart_to_order_pct}%`}
        />
      </div>
    </div>
  );
}

function Copilot({ lang }: { lang: Lang }) {
  const [turns, setTurns] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [thinking, setThinking] = useState(false);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const question = String(new FormData(form).get("q") ?? "").trim();
    if (!question || thinking) return;
    form.reset();

    const history = [...turns, { role: "user" as const, content: question }];
    setTurns(history);
    setThinking(true);
    try {
      const answer = await admin.copilot(lang, history);
      setTurns([...history, { role: "assistant", content: answer.reply }]);
    } catch {
      setTurns([
        ...history,
        {
          role: "assistant",
          content:
            lang === "ar"
              ? "المساعد غير متاح الآن."
              : "The assistant isn't available right now.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div>
      {turns.length === 0 ? (
        <p className="text-[15px] text-ink-soft leading-relaxed">
          {lang === "ar"
            ? "اسألني: ماذا أصنع بعد؟ لماذا كان هذا الأسبوع أضعف؟ ما معنى نسبة الرفض؟"
            : "Ask me: what should I make next? Why was this week worse? What does the refusal rate mean?"}
        </p>
      ) : null}

      <div className="space-y-3">
        {turns.map((turn, index) => (
          <div
            key={index}
            className={`max-w-[88%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line ${
              turn.role === "user" ? "ms-auto bg-clay text-white" : "me-auto bg-surface shadow-soft"
            }`}
          >
            {turn.content}
          </div>
        ))}
        {thinking ? (
          <div className="me-auto rounded-3xl bg-surface px-4 py-3 text-[15px] text-ink-soft shadow-soft">
            …
          </div>
        ) : null}
      </div>

      <form onSubmit={send} className="mt-5 flex gap-2">
        <input name="q" autoComplete="off" className="field flex-1" />
        <button type="submit" disabled={thinking} className="btn-primary px-5">
          →
        </button>
      </form>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 shadow-soft">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ lang }: { lang: Lang }) {
  return (
    <p className="text-[14px] text-ink-soft">{lang === "ar" ? "لا شيء بعد." : "Nothing yet."}</p>
  );
}
