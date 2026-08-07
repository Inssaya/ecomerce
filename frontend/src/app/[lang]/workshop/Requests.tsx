"use client";

/**
 * Answering "can you make me this?"
 *
 * The Workshop is half of what this shop says it is, and until now that half
 * dead-ended: a request could be received, the customer was told we read every
 * one ourselves, and there was no way to reply. This screen is the reply.
 *
 * The one rule the whole flow exists to protect is on the page in words: **a
 * quote is not an order.** Nothing is owed until the customer sees a price and
 * a date and says yes — so both fields are required here, exactly as they are
 * on the server. A price without a date is the vagueness that gets a package
 * refused at the door three weeks later.
 */
import { useCallback, useEffect, useState } from "react";

import { admin, NotSignedIn, type AdminRequest } from "@/lib/admin";
import { type Lang, money, statusLabel } from "@/lib/i18n";

const FILTERS = [
  ["requested", "Waiting on you", "بانتظارك"],
  ["quoted", "Priced", "سعّرناها"],
  ["approved", "Agreed", "اتّفقنا"],
  ["in_production", "Being made", "قيد الصنع"],
  ["", "All", "الكل"],
] as const;

export function Requests({ lang, onExpire }: { lang: Lang; onExpire: () => void }) {
  const ar = lang === "ar";
  // Opens on the ones that need an answer, because that is the only reason to
  // come to this screen.
  const [filter, setFilter] = useState<string>("requested");
  const [requests, setRequests] = useState<AdminRequest[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await admin.requests(lang, filter || undefined));
    } catch (error) {
      if (error instanceof NotSignedIn) onExpire();
      else setProblem(ar ? "تعذّر التحميل" : "Could not load");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, filter]);

  useEffect(() => {
    setRequests(null);
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([value, en, arabic]) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`tap shrink-0 rounded-2xl px-4 text-[13px] font-medium transition-colors duration-gentle ${
              filter === value ? "bg-clay text-white" : "bg-clay-soft text-ink"
            }`}
          >
            {ar ? arabic : en}
          </button>
        ))}
      </div>

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      {requests === null ? (
        <div className="h-32" aria-hidden />
      ) : requests.length === 0 ? (
        <p className="text-[14px] text-ink-soft">
          {ar ? "لا شيء بانتظارك." : "Nothing waiting on you."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <li key={request.reference} className="card p-4 shadow-soft">
              <button
                type="button"
                onClick={() => setOpen(open === request.reference ? null : request.reference)}
                aria-expanded={open === request.reference}
                className="w-full text-start"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="stamp text-[15px] font-semibold">{request.reference}</span>
                  <span className="text-[13px] font-medium text-clay">
                    {statusLabel(lang, "requestStatus", request.status)}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed line-clamp-2">
                  {request.description}
                </p>
              </button>

              {open === request.reference ? (
                <div className="mt-4 flex flex-col gap-4 border-t border-sand pt-4">
                  {/* In their own words, in full — this is the most valuable
                      text in the database and it should not be truncated when
                      it is actually being read. */}
                  <p className="text-[15px] leading-relaxed whitespace-pre-line">
                    {request.description}
                  </p>

                  {request.whatsapp_url ? (
                    <a
                      href={request.whatsapp_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-quiet self-start"
                    >
                      WhatsApp
                    </a>
                  ) : null}

                  {request.quote_price ? (
                    <p className="text-[14px]">
                      {ar ? "أرسلنا" : "We sent"}{" "}
                      <span className="stamp font-semibold">
                        {money(request.quote_price, lang)}
                      </span>
                      {request.promised_for ? (
                        <>
                          {" · "}
                          {ar ? "جاهز في" : "ready on"}{" "}
                          <span className="stamp">{request.promised_for}</span>
                        </>
                      ) : null}
                    </p>
                  ) : null}

                  {request.status === "requested" || request.status === "quoted" ? (
                    <QuoteForm
                      lang={lang}
                      reference={request.reference}
                      onDone={load}
                      onExpire={onExpire}
                    />
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A price and a date, both required.
 *
 * The date is entered as a number of days rather than a calendar date, because
 * that is how a workshop actually thinks about it — "four days from when I
 * start" — and the server turns it into the real date the customer is
 * promised.
 */
function QuoteForm({
  lang,
  reference,
  onDone,
  onExpire,
}: {
  lang: Lang;
  reference: string;
  onDone: () => Promise<void>;
  onExpire: () => void;
}) {
  const ar = lang === "ar";
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = new FormData(event.currentTarget);
    const price = Number(form.get("price"));
    const days = Number(form.get("days"));
    if (!(price > 0) || !(days >= 1)) {
      setProblem(ar ? "الثمن وعدد الأيام مطلوبان" : "Both a price and a number of days");
      return;
    }

    setSending(true);
    setProblem(null);
    try {
      await admin.quote(lang, reference, price, days, String(form.get("note") ?? ""));
      await onDone();
    } catch (error) {
      if (error instanceof NotSignedIn) onExpire();
      else setProblem(ar ? "تعذّر الإرسال" : "That would not send");
      setSending(false);
    }
  }

  async function decline() {
    setSending(true);
    try {
      await admin.moveRequest(lang, reference, "declined");
      await onDone();
    } catch (error) {
      if (error instanceof NotSignedIn) onExpire();
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label" htmlFor={`price-${reference}`}>
            {ar ? "الثمن" : "Price"}
          </label>
          <input
            id={`price-${reference}`}
            name="price"
            type="number"
            min={1}
            // Whole dirhams, and every one of them valid.
            //
            // This was `step={10}`, which sounds harmless and is not: the step
            // is counted from `min`, so the only acceptable prices became 1,
            // 11, 21, 31… A price of 140 made the field invalid, the browser
            // silently refused to submit the form, and the owner pressed send
            // and watched nothing happen.
            step={1}
            inputMode="numeric"
            required
            className="field"
          />
        </div>
        <div className="flex-1">
          <label className="label" htmlFor={`days-${reference}`}>
            {ar ? "خلال كم يوماً" : "In how many days"}
          </label>
          <input
            id={`days-${reference}`}
            name="days"
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            required
            className="field"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor={`note-${reference}`}>
          {ar ? "ملاحظة للزبون (اختياري)" : "A note to them (optional)"}
        </label>
        <textarea id={`note-${reference}`} name="note" rows={2} className="field resize-none" />
      </div>

      {problem ? <p className="text-[13px] text-warn">{problem}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={sending} className="btn-primary">
          {ar ? "أرسل الثمن" : "Send the price"}
        </button>
        <button type="button" disabled={sending} onClick={() => void decline()} className="btn-quiet">
          {ar ? "لا يمكننا صنعها" : "We can't make this"}
        </button>
      </div>
      <p className="text-[12px] text-ink-soft">
        {ar
          ? "لا شيء عليه حتى يوافق على الثمن. الموافقة هي ما ينشئ الطلب."
          : "Nothing is owed until they agree. Agreeing is what creates the order."}
      </p>
    </form>
  );
}
