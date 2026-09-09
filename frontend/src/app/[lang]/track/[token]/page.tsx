"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";

import { api, type OrderView } from "@/lib/api";
import { type Lang, isLang, money, statusLabel, translator } from "@/lib/i18n";

const STEPS = ["placed", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

/**
 * Following an order, and — the first time it is seen — confirming one.
 *
 * The token in the URL is the credential, long and random precisely so this
 * page needs no login. Nobody should have to make an account to find out
 * where their package is.
 *
 * Checkout sends people here with `?placed`, because it used to send them
 * here with nothing: the form simply became this page, so the instant after
 * somebody committed to handing cash to a courier, the shop said nothing to
 * them at all. That is the most anxious moment in the purchase and it was
 * the emptiest. The confirmation only shows on that first arrival — coming
 * back a week later to check on delivery should not still read as "thanks
 * for your order".
 */
export default function Track({ params }: { params: Promise<{ lang: string; token: string }> }) {
  const { lang: raw, token } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;

  // `useSearchParams` needs a Suspense boundary in an app-router page.
  return (
    <Suspense fallback={<div className="page pt-10" aria-hidden />}>
      <TrackBody lang={lang} token={token} />
    </Suspense>
  );
}

function TrackBody({ lang, token }: { lang: Lang; token: string }) {
  const t = translator(lang);
  const justPlaced = useSearchParams().get("placed") !== null;

  const [order, setOrder] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.order(lang, token).then(setOrder).catch(() => setMissing(true));
  }, [lang, token]);

  if (missing) return <p className="page pt-20 text-center text-ink-soft">{t("notFound")}</p>;
  if (!order) return <div className="page pt-10" aria-hidden />;

  const reached = STEPS.indexOf(order.status);
  const wentWrong = ["cancelled", "failed", "returned"].includes(order.status);
  const line1 = order.address?.line1?.trim();
  const city = order.address?.city?.trim() || order.city;

  return (
    <div className="page-wide pt-8 pb-10 lg:max-w-[900px]">
      {justPlaced ? (
        <div className="card mb-7 border-clay/30 bg-clay-soft p-5 shadow-soft">
          <p className="text-[19px] font-semibold">{t("orderPlaced")}</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
            {t("orderPlacedBody", { phone: order.customer_phone })}
          </p>
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
        <div>
          <p className="text-[15px] text-ink-soft">{t("yourReference")}</p>
          <h1 className="stamp text-[30px] font-semibold">{order.reference}</h1>

          <p className="mt-6 text-[19px] font-semibold">
            {statusLabel(lang, "orderStatus", order.status)}
          </p>

          {wentWrong ? null : (
            <ol className="mt-6 space-y-0">
              {STEPS.map((step, index) => {
                const done = index <= reached;
                return (
                  <li key={step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`h-3 w-3 rounded-full transition-colors ease-gentle ${
                          done ? "bg-clay" : "bg-sand"
                        }`}
                      />
                      {index < STEPS.length - 1 ? (
                        <span className={`w-[2px] flex-1 ${done ? "bg-clay/40" : "bg-sand"}`} />
                      ) : null}
                    </div>
                    <span
                      className={`pb-6 text-[15px] ${done ? "text-ink font-medium" : "text-ink-soft"}`}
                    >
                      {statusLabel(lang, "orderStatus", step)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <ul className="mt-4 space-y-2">
            {order.items.map((item, index) => (
              <li key={index} className="card p-4 shadow-soft">
                <p className="text-[15px] font-medium">{item.title}</p>
                {item.variant_label ? (
                  <p className="text-[13px] text-ink-soft">{item.variant_label}</p>
                ) : null}
                <p className="mt-1 text-[15px]">
                  {item.quantity} × {money(item.unit_price, lang)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <aside className="mt-5 space-y-4 lg:mt-0 lg:sticky lg:top-20">
          {/* Where it is going. A buyer who cannot check the address before a
              courier arrives has no way to catch a typo they made minutes ago,
              and a parcel sent to the wrong street is a refusal. */}
          {line1 || city ? (
            <div className="card p-5 shadow-soft">
              <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
                {t("deliveringTo")}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed">
                {order.customer_name}
                {line1 ? <><br />{line1}</> : null}
                {city ? <><br />{city}</> : null}
              </p>
            </div>
          ) : null}

          {/* Broken out, exactly as the checkout breaks it out. This page is
              the one the customer still has when the courier knocks, and
              "why is it more than the pieces cost" is the question that gets
              a parcel refused — so the answer has to survive to here. */}
          <div className="card p-5 shadow-soft">
            <div className="flex justify-between text-[15px] text-ink-soft">
              <span>{t("subtotal")}</span>
              <span className="stamp">{money(order.subtotal, lang)}</span>
            </div>
            <div className="mt-1 flex justify-between text-[15px] text-ink-soft">
              <span>{t("delivery")}</span>
              <span className="stamp">
                {order.delivery_fee === 0 ? t("freeDelivery") : money(order.delivery_fee, lang)}
              </span>
            </div>
            <div className="mt-2 flex justify-between border-t border-sand pt-2 text-[17px] font-semibold">
              <span>{t("total")}</span>
              <span className="stamp">{money(order.total, lang)}</span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{t("payAtDoor")}</p>
          </div>

          <p className="text-[13.5px] leading-relaxed text-ink-mute">{t("keepThisLink")}</p>

          {order.whatsapp_url ? (
            <a href={order.whatsapp_url} className="btn-quiet w-full">
              {t("talkToAPerson")}
            </a>
          ) : null}

          <Link href={`/${lang}`} className="btn-quiet w-full">
            {t("keepShopping")}
          </Link>
        </aside>
      </div>
    </div>
  );
}
