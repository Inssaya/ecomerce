"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";

/**
 * Getting back into an order without the link.
 *
 * The tracking link is a long random token, which is what lets that page work
 * without a login — and it is also why losing it used to mean losing the
 * order. People close the tab, they clear WhatsApp, they ordered from a
 * friend's phone. In a shop where the whole transaction is *wait for someone
 * to knock and then hand over cash*, being unable to check on it is how a
 * package gets refused at the door.
 *
 * Two fields, both required. The reference alone would be short enough to
 * guess at eventually; the reference and the number belonging to it is not,
 * and the endpoint behind this is rate-limited and answers both kinds of
 * failure identically.
 */
export default function FindOrder({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const router = useRouter();

  const [state, setState] = useState<"idle" | "looking" | "missing" | "failed">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "looking") return;
    const form = new FormData(event.currentTarget);
    setState("looking");
    try {
      const order = await api.findOrder(lang, {
        reference: String(form.get("reference") ?? "").trim(),
        phone: String(form.get("phone") ?? "").trim(),
      });
      // Hand them to the page they were always meant to be on, with the token
      // back in their history where they can find it again.
      router.replace(`/${lang}/track/${order.tracking_token}`);
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? "missing" : "failed");
    }
  }

  return (
    <div className="page pt-8 pb-10">
      <h1 className="sr-only">{t("findYourOrder")}</h1>
      <p className="mt-2 text-[15px] text-ink-soft leading-relaxed">{t("findYourOrderLead")}</p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <div>
          <label className="label" htmlFor="reference">
            {t("yourReference")}
          </label>
          <input
            id="reference"
            name="reference"
            required
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="7KQ4M2XP"
            // Stamped, like it is everywhere else the reference appears, so
            // the thing they are copying looks like the thing they were sent.
            className="field stamp uppercase tracking-wide"
          />
          <p className="mt-1.5 text-[13px] text-ink-soft">{t("referenceHint")}</p>
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

        {state === "missing" ? (
          <p className="text-[14px] text-ink-soft">{t("notFound")}</p>
        ) : state === "failed" ? (
          <p className="text-[14px] text-ink-soft">{t("somethingWentWrong")}</p>
        ) : null}

        <button type="submit" disabled={state === "looking"} className="btn-primary w-full">
          {state === "looking" ? t("findingIt") : t("findIt")}
        </button>
      </form>
    </div>
  );
}
