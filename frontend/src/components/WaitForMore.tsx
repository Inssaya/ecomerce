"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import { type Lang, translator } from "@/lib/i18n";

/**
 * "Tell me when you make another."
 *
 * Shown only where a piece has gone. Everything about it is deliberately one
 * step: one field, the number they already know, no account, no email
 * confirmation. Anything more and the visitor leaves instead, which is what
 * the sold-out page was already doing.
 *
 * It is also the workshop's sharpest demand signal — sharper than a search,
 * because it is attached to a real piece at a price they have already seen.
 * So the owner panel reads the same rows to answer *what should I make next*.
 */
export function WaitForMore({ lang, slug }: { lang: Lang; slug: string }) {
  const t = translator(lang);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      await api.waitForMore(lang, slug, { phone: phone.trim() });
      setState("done");
    } catch {
      setState("failed");
    }
  }

  if (state === "done") {
    return (
      <section className="mt-8 card p-5 shadow-soft bg-clay-soft/60">
        <p className="text-[15px] font-medium">{t("tellMeDone")}</p>
      </section>
    );
  }

  return (
    <section className="mt-8 card p-5 shadow-soft">
      <h2 className="text-[17px] font-semibold">{t("tellMeWhenMade")}</h2>
      <p className="mt-1.5 text-[14px] text-ink-soft leading-relaxed">{t("tellMeWhy")}</p>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="wait-phone">
          {t("yourPhone")}
        </label>
        <input
          id="wait-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0612345678"
          className="field flex-1"
        />
        <button type="submit" disabled={state === "sending"} className="btn-primary shrink-0">
          {t("tellMeSend")}
        </button>
      </form>

      {state === "failed" ? (
        <p className="mt-2 text-[13px] text-ink-soft">{t("somethingWentWrong")}</p>
      ) : null}
    </section>
  );
}
