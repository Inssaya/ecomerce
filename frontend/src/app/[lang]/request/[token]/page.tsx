"use client";

import { use, useEffect, useState } from "react";

import { api, ApiError, type RequestView } from "@/lib/api";
import { type Lang, isLang, money, statusLabel, translator } from "@/lib/i18n";

/**
 * Following a custom request, and saying yes to a quote.
 *
 * The address is asked for here rather than when the request was made: nobody
 * should have to type their address to find out a price.
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

  async function approve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeciding(true);
    setProblem(null);
    const form = new FormData(event.currentTarget);
    try {
      setRequest(
        await api.approveQuote(lang, token, {
          address: { line1: form.get("line1"), city: form.get("city") },
        }),
      );
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : t("somethingWentWrong"));
    } finally {
      setDeciding(false);
    }
  }

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
      <h1 className="text-[30px] font-semibold tracking-tight tabular-nums">{request.reference}</h1>

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
            <span>{money(request.quote_price, lang)}</span>
          </div>
          {request.promised_for ? (
            <p className="mt-1.5 text-[15px] text-ink-soft">
              {t("readyOn")} {request.promised_for}
            </p>
          ) : null}
          {request.quote_note ? (
            <p className="mt-3 text-[15px] text-ink-soft leading-relaxed">{request.quote_note}</p>
          ) : null}
        </section>
      ) : null}

      {request.status === "quoted" ? (
        <form onSubmit={approve} className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="city">
              {t("yourCity")}
            </label>
            <input id="city" name="city" required autoComplete="address-level2" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="line1">
              {t("yourAddress")}
            </label>
            <input
              id="line1"
              name="line1"
              required
              autoComplete="street-address"
              className="field"
            />
          </div>

          {problem ? (
            <p role="alert" className="text-[15px] text-warn">
              {problem}
            </p>
          ) : null}

          <button type="submit" disabled={deciding} className="btn-primary w-full">
            {t("approveQuote")}
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={deciding}
            className="tap w-full text-[14px] text-ink-soft"
          >
            {t("declineQuote")}
          </button>
          <p className="text-center text-[13px] text-ink-soft">{t("payAtDoor")}</p>
        </form>
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
