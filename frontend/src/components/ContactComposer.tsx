"use client";

import { useMemo, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { type Lang, translator } from "@/lib/i18n";

const CONTACT_EMAIL = "workshop@mostyle.ma";

export function ContactComposer({
  lang,
  whatsappNumber,
}: {
  lang: Lang;
  whatsappNumber: string | null;
}) {
  const t = translator(lang);
  const ar = lang === "ar";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send() {
    if (sending) return;
    if (!name.trim() || !message.trim() || !(email.trim() || phone.trim())) {
      setProblem(
        ar
          ? "الاسم والرسالة مطلوبان، وكذلك بريد أو هاتف لنرد به."
          : "Name and message are required, plus an email or phone so we can reply.",
      );
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      await api.contact(lang, {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        message: message.trim(),
      });
      setSent(true);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : ar ? "تعذّر الإرسال" : "That would not send");
    } finally {
      setSending(false);
    }
  }

  const draft = useMemo(() => {
    const lines = [
      ar ? "مرحباً، أريد إرسال رسالة شخصية." : "Hello, I want to send a personal message.",
      name.trim() ? `${ar ? "الاسم" : "Name"}: ${name.trim()}` : null,
      phone.trim() ? `${ar ? "الهاتف" : "Phone"}: ${phone.trim()}` : null,
      email.trim() ? `${ar ? "البريد" : "Email"}: ${email.trim()}` : null,
      message.trim() ? "" : null,
      message.trim() || null,
    ].filter((line): line is string => Boolean(line));

    return lines.join("\n");
  }, [ar, email, message, name, phone]);

  const subject = ar ? "رسالة من موقع MoStyle" : "Message from MoStyle";
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(draft)}`
    : null;
  const mailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(draft)}`;

  return (
    <section className="rounded-[28px] border border-sand bg-surface p-5 sm:p-6">
      <div>
        <p className="text-[13.5px] font-medium text-clay">{ar ? "رسالة شخصية" : "Personal message"}</p>
        <h2 className="mt-2 text-[clamp(24px,2.9vw,38px)] leading-[1.05] font-semibold tracking-[-0.04em]">
          {ar ? "اكتبها مرة واحدة ثم أرسلها بالطريقة التي تفضلها." : "Write it once, then send it the way you prefer."}
        </h2>
        <p className="mt-3 max-w-[58ch] text-[15px] leading-[1.7] text-ink-soft">
          {ar
            ? "إذا كان لديك شعار، صورة، مقاس، أو تاريخ مطلوب، اكتب كل شيء هنا. WhatsApp يفتح الرسالة جاهزة، والبريد يرسلها مباشرة إلى الورشة."
            : "If you have a logo, a photo, a size or a date in mind, write it here. WhatsApp opens a ready-made draft, and email sends it straight to the workshop."}
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="contact-name">
            {t("yourName")}
          </label>
          <input
            id="contact-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="contact-email">
            {t("yourEmail")}
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="contact-phone">
            {t("yourPhone")}
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
            rows={6}
            placeholder={ar ? "أكتب ما تريد صنعه أو تعديله..." : "Write what you want made or changed..."}
            className="field resize-none"
          />
        </div>
      </div>

      {sent ? (
        <p role="status" className="mt-5 text-[15px] font-medium text-good">
          {ar ? "وصلت رسالتك. سنعود إليك قريباً." : "Your message has arrived. We'll get back to you soon."}
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={sending} onClick={() => void send()} className="btn-primary h-[52px] px-6">
              {sending ? (ar ? "جارٍ الإرسال…" : "Sending…") : ar ? "أرسل الرسالة" : "Send message"}
            </button>
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn-quiet h-[52px] px-6">
                {ar ? "أو عبر WhatsApp" : "Or on WhatsApp"}
              </a>
            ) : null}
            <a href={mailHref} className="btn-quiet h-[52px] px-6">
              {ar ? "أو بالبريد" : "Or by email"}
            </a>
          </div>
          {problem ? (
            <p role="alert" className="mt-3 text-[13.5px] text-warn">
              {problem}
            </p>
          ) : null}
        </>
      )}

      <p className="mt-4 text-[13.5px] leading-[1.6] text-ink-mute">
        {ar
          ? "نرد عادةً خلال ساعات العمل. \"أرسل الرسالة\" تصل إلينا مباشرة؛ WhatsApp والبريد يفتحان مسودة يمكنك إرفاق صورة بها."
          : "We usually reply during working hours. \"Send message\" reaches us directly; WhatsApp and email open a draft you can attach a photo to."}
      </p>
    </section>
  );
}