"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";

/**
 * "If we cannot find it, we make it."
 *
 * Three fields. Asking costs nothing and commits to nothing — a long form here
 * is a lead that never arrives.
 */
export default function Ask({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const router = useRouter();

  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setProblem(null);

    const form = new FormData(event.currentTarget);
    try {
      const created = await api.ask(lang, {
        full_name: form.get("full_name"),
        phone: form.get("phone"),
        email: form.get("email") || null,
        city: form.get("city") || null,
        description: form.get("description"),
        budget: form.get("budget") ? Number(form.get("budget")) : null,
        lang,
      });
      router.replace(`/${lang}/request/${created.tracking_token}`);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : t("somethingWentWrong"));
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="page pt-6 pb-10">
      <h1 className="text-[26px] font-semibold tracking-tight">{t("tellUs")}</h1>
      <p className="mt-2 text-[15px] text-ink-soft leading-relaxed">{t("tellUsLead")}</p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="description">
            {t("whatIsIt")}
          </label>
          <textarea
            id="description"
            name="description"
            required
            minLength={10}
            rows={5}
            className="field resize-none"
          />
          <p className="mt-1.5 text-[13px] text-ink-soft">{t("whatIsItHint")}</p>
        </div>

        <div>
          <label className="label" htmlFor="full_name">
            {t("yourName")}
          </label>
          <input id="full_name" name="full_name" required autoComplete="name" className="field" />
        </div>

        <div>
          <label className="label" htmlFor="phone">
            {t("yourPhone")}
          </label>
          <input
            id="phone"
            name="phone"
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0612345678"
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="city">
            {t("yourCity")}
          </label>
          <input id="city" name="city" autoComplete="address-level2" className="field" />
        </div>

        <div>
          <label className="label" htmlFor="budget">
            {t("budget")}
          </label>
          <input
            id="budget"
            name="budget"
            type="number"
            inputMode="numeric"
            min={1}
            className="field"
          />
        </div>

        <div>
          <label className="label" htmlFor="email">
            {t("yourEmail")}
          </label>
          <input id="email" name="email" type="email" autoComplete="email" className="field" />
        </div>
      </div>

      {problem ? (
        <p role="alert" className="mt-4 text-[15px] text-warn">
          {problem}
        </p>
      ) : null}

      <button type="submit" disabled={sending} className="btn-primary w-full mt-6">
        {sending ? t("sending") : t("send")}
      </button>
      <p className="mt-3 text-center text-[13px] text-ink-soft">{t("nothingOwed")}</p>
    </form>
  );
}
