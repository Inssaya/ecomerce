"use client";

/**
 * What is actually happening on the site.
 *
 * Ordered the way the owner would ask: how many people, where they stopped,
 * which pieces are working, which screens are working, and what they wanted
 * that we do not make. The funnel comes second rather than fifth because the
 * step that loses the most people is the single most actionable thing on this
 * screen, and it is worth seeing before any table.
 */
import { useEffect, useState } from "react";

import { Funnel, Meter, Sparkline, Stat, Table } from "@/components/charts";
import { admin, NotSignedIn, type Analytics } from "@/lib/admin";
import type { Lang } from "@/lib/i18n";

const RANGES = [7, 30, 90] as const;

const COPY = {
  visitors: ["People", "أشخاص"],
  returning: ["Came back", "عادوا"],
  perVisitor: ["Things each did", "ما فعله كلٌّ منهم"],
  whereTheyStop: ["Where people stop", "أين يتوقف الناس"],
  pieces: ["Piece by piece", "قطعة قطعة"],
  screens: ["Screen by screen", "شاشة شاشة"],
  wanted: ["Wanted, and we had none", "أرادوه ولم يكن لدينا"],
  asked: ["Asked us to make", "طلبوا منّا صنعه"],
  days: ["last {n} days", "آخر {n} يوماً"],
  nothing: ["Nothing yet.", "لا شيء بعد."],
  saw: ["Saw", "رأوا"],
  opened: ["Opened", "فتحوا"],
  stayed: ["Read", "قرأوا"],
  bought: ["Bought", "اشتروا"],
  people: ["People", "أشخاص"],
  scrolled: ["Scrolled", "مرّروا"],
  seconds: ["Seconds", "ثوانٍ"],
  searched: ["Searched", "بحثوا"],
} as const;

export function Live({ lang, onExpire }: { lang: Lang; onExpire: () => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    admin
      .analytics(lang, days)
      .then((result) => !cancelled && setData(result))
      .catch((error) => error instanceof NotSignedIn && onExpire());
    return () => {
      cancelled = true;
    };
    // `onExpire` is redefined every render by the parent; re-running on it
    // would refetch the whole dashboard on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, days]);

  const t = (key: keyof typeof COPY, values?: Record<string, number>): string => {
    const text: string = COPY[key][lang === "ar" ? 1 : 0];
    return values
      ? Object.entries(values).reduce<string>(
          (out, [name, value]) => out.replace(`{${name}}`, String(value)),
          text,
        )
      : text;
  };

  if (!data) return <div className="h-40" aria-hidden />;

  const { audience, funnel, products, pages, unmet } = data;
  const topSaw = Math.max(...products.items.map((row) => row.saw), 1);
  const topPeople = Math.max(...pages.items.map((row) => row.people), 1);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        {RANGES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDays(option)}
            aria-pressed={days === option}
            className={`tap rounded-2xl px-4 text-[13px] font-medium transition-colors duration-gentle ${
              days === option ? "bg-clay text-white" : "bg-clay-soft text-ink"
            }`}
          >
            {t("days", { n: option })}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Stat label={t("visitors")} value={String(audience.visitors)} />
        <Stat
          label={t("returning")}
          value={`${audience.returning_pct}%`}
          note={String(audience.returning)}
        />
        <Stat label={t("perVisitor")} value={String(audience.actions_per_visitor)} />
      </div>

      <section className="card p-5 shadow-soft">
        <Sparkline points={audience.daily} label={t("visitors")} />
      </section>

      <section className="card p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold">{t("whereTheyStop")}</h2>
        <div className="mt-4">
          <Funnel steps={funnel.steps} lang={lang} />
        </div>
      </section>

      <section className="card p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold">{t("pieces")}</h2>
        <div className="mt-3">
          {products.items.length === 0 ? (
            <Empty lang={lang} />
          ) : (
            <Table head={["", t("saw"), t("opened"), t("stayed"), t("bought")]}>
              {products.items.map((row) => (
                <tr key={row.product_id} className="border-t border-sand">
                  <th scope="row" className="py-2 pe-3 text-start font-medium">
                    {row.title}
                  </th>
                  <td className="py-2 ps-3 text-end">
                    <Meter value={row.saw} of={topSaw}>
                      {row.saw}
                    </Meter>
                  </td>
                  <td className="py-2 ps-3 text-end stamp tabular-nums">
                    {row.opened}
                    <span className="text-ink-soft"> · {row.opened_pct}%</span>
                  </td>
                  <td className="py-2 ps-3 text-end stamp tabular-nums text-ink-soft">
                    {row.avg_seconds ? `${Math.round(row.avg_seconds)}s` : "—"}
                  </td>
                  <td className="py-2 ps-3 text-end stamp tabular-nums">
                    {row.bought}
                    {row.opened ? (
                      <span className="text-ink-soft"> · {row.bought_pct}%</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </section>

      <section className="card p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold">{t("screens")}</h2>
        <div className="mt-3">
          {pages.items.length === 0 ? (
            <Empty lang={lang} />
          ) : (
            <Table head={["", t("people"), t("scrolled"), t("seconds")]}>
              {pages.items.map((row) => (
                <tr key={row.path} className="border-t border-sand">
                  <th scope="row" className="py-2 pe-3 text-start">
                    <span className="stamp text-[12.5px]">{row.path}</span>
                  </th>
                  <td className="py-2 ps-3 text-end">
                    <Meter value={row.people} of={topPeople}>
                      {row.people}
                    </Meter>
                  </td>
                  <td className="py-2 ps-3 text-end stamp tabular-nums">
                    {row.scrolled_pct ? `${row.scrolled_pct}%` : "—"}
                  </td>
                  <td className="py-2 ps-3 text-end stamp tabular-nums text-ink-soft">
                    {row.avg_seconds ? `${Math.round(row.avg_seconds)}s` : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </section>

      {/*
        The most direct evidence the shop has of what to make: somebody came
        here, typed a word, and we had nothing to show them.
      */}
      <section className="card p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold">{t("wanted")}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {unmet.searched_and_found_nothing.length === 0 ? (
            <Empty lang={lang} />
          ) : (
            unmet.searched_and_found_nothing.map((row) => (
              <div key={row.query} className="flex items-baseline justify-between gap-3">
                <span className="text-[15px]">{row.query}</span>
                <span className="stamp text-[13px] tabular-nums text-ink-soft">
                  {row.people}
                </span>
              </div>
            ))
          )}
        </div>

        {unmet.asked_us_to_make.length > 0 ? (
          <>
            <h3 className="mt-5 text-[14px] font-semibold">{t("asked")}</h3>
            <div className="mt-2 flex flex-col gap-2">
              {unmet.asked_us_to_make.map((row) => (
                <div key={row.category} className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px]">
                    {lang === "ar" ? row.category_ar : row.category}
                  </span>
                  <span className="stamp text-[13px] tabular-nums text-ink-soft">
                    {row.requests}
                    {row.avg_budget ? ` · ~${row.avg_budget}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function Empty({ lang }: { lang: Lang }) {
  return (
    <p className="text-[14px] text-ink-soft">
      {lang === "ar" ? "لا شيء بعد." : "Nothing yet."}
    </p>
  );
}

