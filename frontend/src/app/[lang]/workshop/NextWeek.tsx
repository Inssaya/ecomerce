"use client";

/**
 * What we expect to sell in the next seven days.
 *
 * The screen leads with what to *do* — the pieces the shelf will not cover —
 * and only then shows the whole table. A forecast the owner has to interpret
 * before acting on is a forecast they will stop opening.
 *
 * Two rules this screen keeps, both of them about not lying:
 *
 * 1. **Never show the point estimate alone.** Every row shows its range, and
 *    fractions are written as English rather than as decimals, because "0.4"
 *    against a hand-made piece is a number that invites false precision while
 *    "about one a fortnight" is the same fact stated honestly.
 * 2. **Every row can be interrogated.** Tapping one shows the sentence that
 *    produced it and how much evidence is behind it.
 */
import { useEffect, useState } from "react";

import { Confidence, Stat } from "@/components/charts";
import { admin, NotSignedIn, type Forecast, type ForecastRow } from "@/lib/admin";
import { type Lang, money } from "@/lib/i18n";

export function NextWeek({ lang, onExpire }: { lang: Lang; onExpire: () => void }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const ar = lang === "ar";

  useEffect(() => {
    let cancelled = false;
    admin
      .forecast(lang)
      .then((result) => !cancelled && setData(result))
      .catch((error) => error instanceof NotSignedIn && onExpire());
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  if (!data) return <div className="h-40" aria-hidden />;

  const selling = data.items.filter((row) => row.expected > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5">
        <Stat
          label={ar ? "قطع متوقّعة" : "Pieces expected"}
          value={roughly(data.expected_units, lang)}
          note={ar ? "خلال ٧ أيام" : "over 7 days"}
        />
        <Stat
          label={ar ? "إن تحقّق" : "If it lands"}
          value={money(data.expected_revenue, lang)}
        />
      </div>

      {/*
        The whole reason this screen exists. Everything below is evidence; this
        is the instruction.
      */}
      {data.make_now.length > 0 ? (
        <section className="card p-5 shadow-soft border border-warn/40">
          <h2 className="text-[16px] font-semibold">{ar ? "اصنع هذه الآن" : "Make these now"}</h2>
          <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
            {ar
              ? "الرف لن يغطي الأسبوع القادم في أسوأ الحالات."
              : "The shelf will not cover next week at the top of the range."}
          </p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {data.make_now.map((row) => (
              <li key={row.product_id} className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-medium">{ar ? row.title_ar : row.title}</span>
                <span className="stamp text-[15px] font-semibold tabular-nums text-warn">
                  +{row.make}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-5 shadow-soft">
        <h2 className="text-[16px] font-semibold">
          {ar ? "لكل قطعة" : "Piece by piece"}
        </h2>
        <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
          {ar
            ? `مبنيّ على آخر ${data.based_on_days} يوماً، والأيام الأحدث تزن أكثر. اضغط على أي سطر لمعرفة السبب.`
            : `From the last ${data.based_on_days} days, with recent days weighted far more. Tap a row for why.`}
        </p>

        <ul className="mt-4 flex flex-col gap-1">
          {selling.length === 0 ? (
            <p className="text-[14px] text-ink-soft">
              {ar ? "لا توجد مبيعات كافية بعد." : "Not enough has sold yet to say."}
            </p>
          ) : (
            selling.map((row) => (
              <Row
                key={row.product_id}
                row={row}
                lang={lang}
                open={open === row.product_id}
                onToggle={() => setOpen(open === row.product_id ? null : row.product_id)}
              />
            ))
          )}
        </ul>
      </section>

      <p className="px-1 text-[12.5px] text-ink-soft leading-relaxed">
        {ar
          ? "هذا تقدير من معدّل البيع الأخير، لا وعد. النطاق هو الجزء المهم."
          : "This is an estimate from the recent rate of selling, not a promise. The range is the part that matters."}
      </p>
    </div>
  );
}

function Row({
  row,
  lang,
  open,
  onToggle,
}: {
  row: ForecastRow;
  lang: Lang;
  open: boolean;
  onToggle: () => void;
}) {
  const ar = lang === "ar";
  const [low, high] = row.range;

  return (
    <li className="border-t border-sand first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full py-3 text-start flex items-baseline justify-between gap-3"
      >
        <span className="flex-1">
          <span className="block text-[15px] font-medium">{ar ? row.title_ar : row.title}</span>
          <span className="block mt-0.5 text-[12.5px] text-ink-soft">
            {row.kind === "workshop"
              ? ar
                ? "تُصنع عند الطلب"
                : "made to order"
              : ar
                ? `${row.on_the_shelf} على الرف`
                : `${row.on_the_shelf} on the shelf`}
          </span>
        </span>
        <span className="text-end">
          <span className="block stamp text-[15px] font-semibold tabular-nums">
            {roughly(row.expected, lang)}
          </span>
          <span className="block stamp text-[12px] tabular-nums text-ink-soft">
            {low}–{high}
          </span>
        </span>
      </button>

      {open ? (
        <div className="pb-3 flex flex-col gap-1.5">
          <p className="text-[13px] text-ink-soft leading-relaxed">{row.because}</p>
          <Confidence level={row.confidence} lang={ar ? "ar" : "en"} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * A fraction of a piece, said the way a person would.
 *
 * The forecast for a hand-made object is often 0.4 of one. Printing "0.4"
 * invites a precision the number does not have; saying "about one a
 * fortnight" is the same fact without the false decimal.
 */
function roughly(expected: number, lang: Lang): string {
  const ar = lang === "ar";
  if (expected >= 1.5) return String(Math.round(expected));
  if (expected >= 0.7) return ar ? "واحدة تقريباً" : "about 1";
  if (expected >= 0.35) return ar ? "واحدة كل أسبوعين" : "1 per 2 weeks";
  if (expected > 0) return ar ? "أقل من ذلك" : "less often";
  return ar ? "لا شيء متوقّع" : "none expected";
}
