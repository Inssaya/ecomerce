"use client";

import { use, useEffect, useState } from "react";

import { api, type OrderView } from "@/lib/api";
import { type Lang, isLang, money, statusLabel, translator } from "@/lib/i18n";

const STEPS = ["placed", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

/**
 * Following an order.
 *
 * The token in the URL is the credential — long and random precisely so this
 * page needs no login. Nobody should have to make an account to find out where
 * their package is.
 */
export default function Track({ params }: { params: Promise<{ lang: string; token: string }> }) {
  const { lang: raw, token } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);

  const [order, setOrder] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.order(lang, token).then(setOrder).catch(() => setMissing(true));
  }, [lang, token]);

  if (missing) return <p className="page pt-20 text-center text-ink-soft">{t("notFound")}</p>;
  if (!order) return <div className="page pt-10" aria-hidden />;

  const reached = STEPS.indexOf(order.status);
  const wentWrong = ["cancelled", "failed", "returned"].includes(order.status);

  return (
    <div className="page pt-8 pb-10">
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
                    className={`h-3 w-3 rounded-full transition-colors duration-gentle ${
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
            <p className="text-[13px] text-ink-soft">
              {[item.variant_label, item.piece_label].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-[15px]">
              {item.quantity} × {money(item.unit_price, lang)}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-5 card p-5 shadow-soft">
        <div className="flex justify-between text-[17px] font-semibold">
          <span>{t("total")}</span>
          <span className="stamp">{money(order.total, lang)}</span>
        </div>
        <p className="mt-2 text-[14px] text-ink-soft leading-relaxed">{t("payAtDoor")}</p>
      </div>

      {order.whatsapp_url ? (
        <a href={order.whatsapp_url} className="btn-quiet w-full mt-5">
          {t("talkToAPerson")}
        </a>
      ) : null}
    </div>
  );
}
