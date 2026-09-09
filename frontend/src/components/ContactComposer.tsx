"use client";

import { useState } from "react";

import { api, ApiError } from "@/lib/api";
import { type Lang, translator } from "@/lib/i18n";

/**
 * One message, one button.
 *
 * This used to offer three ways to send the same words: a Send button, "Or on
 * WhatsApp", and "Or by email" — the last two building a draft out of the
 * fields and handing it to another app. That is a choice nobody wants to
 * make. Somebody who has already typed their message does not want to be
 * asked which app should carry it; they want it gone. And the two draft
 * buttons were worse than useless, because a draft that opens in WhatsApp is
 * a message the shop has no record of until the visitor remembers to press
 * send over there.
 *
 * So: it sends. The message is stored for the console, the workshop is
 * emailed, and the sender is emailed a receipt — which is why the address is
 * now required rather than "email or phone, whichever you have".
 */
export function ContactComposer({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const ar = lang === "ar";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setProblem(null);
    try {
      await api.contact(lang, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        message: message.trim(),
      });
      setSent(true);
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : ar
            ? "تعذّر الوصول إلى المتجر. حاول مرّة أخرى."
            : "We couldn't reach the shop. Try again.",
      );
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <section className="rounded-[28px] border border-sand bg-surface p-6 sm:p-8">
        <h2 className="text-[22px] font-semibold tracking-tight">
          {ar ? "وصلت رسالتك." : "Your message has arrived."}
        </h2>
        <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-ink-soft">
          {ar
            ? `أرسلنا نسخة إلى ${email.trim()} حتى تعرف أنها وصلت. سنرد في أقرب وقت ممكن.`
            : `We've sent a copy to ${email.trim()} so you know it arrived. We'll reply as soon as we can.`}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-sand bg-surface p-5 sm:p-6">
      <h2 className="text-[clamp(22px,2.4vw,30px)] leading-[1.1] font-semibold tracking-[-0.03em]">
        {ar ? "راسل الورشة" : "Send us a message"}
      </h2>
      <p className="mt-2.5 max-w-[54ch] text-[15px] leading-[1.7] text-ink-soft">
        {ar
          ? "سؤال عن طلب، أو عن قطعة، أو أي شيء آخر. نرد على بريدك."
          : "A question about an order, about a piece, or anything else. We reply to your email."}
      </p>

      <form onSubmit={submit} className="mt-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="contact-name">
              {t("yourName")}
            </label>
            <input
              id="contact-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              autoComplete="name"
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="contact-email">
              {t("email")}
            </label>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="field"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="contact-phone">
              {ar ? `${t("yourPhone")} (${"اختياري"})` : `${t("yourPhone")} (optional)`}
            </label>
            <input
              id="contact-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              inputMode="tel"
              className="field"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="contact-message">
              {ar ? "الرسالة" : "Your message"}
            </label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
              minLength={5}
              rows={6}
              className="field resize-none"
            />
          </div>
        </div>

        {problem ? (
          <p role="alert" className="mt-3 text-[13.5px] text-warn">
            {problem}
          </p>
        ) : null}

        <button type="submit" disabled={sending} className="btn-primary mt-5 h-[52px] w-full px-6 sm:w-auto">
          {sending ? (ar ? "جارٍ الإرسال…" : "Sending…") : ar ? "أرسل" : "Send"}
        </button>
      </form>
    </section>
  );
}
