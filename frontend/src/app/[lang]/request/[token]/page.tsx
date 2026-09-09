"use client";

import { use, useEffect, useState } from "react";

import { api, type RequestView } from "@/lib/api";
import { type Lang, isLang, money, statusLabel, translator } from "@/lib/i18n";

/**
 * Following a custom request.
 *
 * There is deliberately no Approve button. A custom piece is agreed on the
 * phone — the details confirmed, the price confirmed — and the owner records
 * the agreement from the console, which is what creates the order. A button
 * that turned a quote into committed work from a link alone would skip the
 * one conversation that stops a misunderstanding becoming a made object
 * nobody wants, and it was reachable by anyone holding the URL.
 *
 * Declining stays, because saying no needs no phone call and waiting on one
 * to refuse a price is the kind of friction that turns a polite no into an
 * ignored message.
 */
export default function RequestPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang: raw, token } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);

  const [request, setRequest] = useState<RequestView | null>(null);
  const [missing, setMissing] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    api.customRequest(lang, token).then(setRequest).catch(() => setMissing(true));
  }, [lang, token]);

  if (missing) return <p className="page pt-20 text-center text-ink-soft">{t("notFound")}</p>;
  if (!request) return <div className="page pt-10" aria-hidden />;

  async function decline() {
    setDeciding(true);
    try {
      setRequest(await api.withdrawRequest(lang, token));
    } catch {
      setProblem(t("somethingWentWrong"));
    } finally {
      setDeciding(false);
    }
  }

  return (
    <div className="page pt-8 pb-10">
      <p className="text-[15px] text-ink-soft">{t("yourReference")}</p>
      <h1 className="stamp text-[30px] font-semibold">{request.reference}</h1>

      <p className="mt-6 text-[19px] font-semibold">
        {statusLabel(lang, "requestStatus", request.status)}
      </p>

      <section className="mt-5 card p-5 shadow-soft">
        <p className="text-[15px] leading-relaxed whitespace-pre-line">{request.description}</p>
      </section>

      {request.quote_price !== null ? (
        <section className="mt-4 card p-5 shadow-soft">
          <div className="flex justify-between text-[17px] font-semibold">
            <span>{t("theQuote")}</span>
            <span className="stamp">{money(request.quote_price, lang)}</span>
          </div>
          {request.quote_note ? (
            <p className="mt-3 text-[15px] text-ink-soft leading-relaxed">{request.quote_note}</p>
          ) : null}
        </section>
      ) : null}

      {request.status === "quoted" ? (
        <div className="mt-5 space-y-4">
          <div className="card p-5 shadow-soft">
            <p className="text-[15px] leading-relaxed">{t("weWillCallYou")}</p>
          </div>

          {problem ? (
            <p role="alert" className="text-[15px] text-warn">
              {problem}
            </p>
          ) : null}

          <button
            type="button"
            onClick={decline}
            disabled={deciding}
            className="tap w-full text-[14px] text-ink-soft"
          >
            {t("declineQuote")}
          </button>
          <p className="text-center text-[13px] text-ink-soft">{t("payAtDoor")}</p>
        </div>
      ) : null}

      {request.order_reference ? (
        <p className="mt-5 text-[15px] text-ink-soft">
          {t("yourReference")}: {request.order_reference}
        </p>
      ) : null}

      {request.whatsapp_url ? (
        <a href={request.whatsapp_url} className="btn-quiet w-full mt-6">
          {t("talkToAPerson")}
        </a>
      ) : null}
    </div>
  );
}
