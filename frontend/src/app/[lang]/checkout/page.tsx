"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { useCart } from "@/components/CartProvider";
import { api, ApiError } from "@/lib/api";
import { type Lang, isLang, money, translator } from "@/lib/i18n";
import { track } from "@/lib/signals";

/**
 * Checkout. Five fields and a total.
 *
 * No account, no password, no payment step — it is cash at the door. Every
 * field removed from this screen is a sale that does not get abandoned on it.
 */
export default function Checkout({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const router = useRouter();
  const { lines, total, clear, ready } = useCart();

  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (ready && lines.length === 0) {
    return (
      <div className="page pt-20 text-center">
        <p className="text-[17px] text-ink-soft">{t("cartEmpty")}</p>
        <Link href={`/${lang}/store`} className="btn-quiet mt-6">
          {t("browse")}
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setProblem(null);

    const form = new FormData(event.currentTarget);
    try {
      const order = await api.checkout(lang, {
        full_name: form.get("full_name"),
        phone: form.get("phone"),
        email: form.get("email") || null,
        lang,
        address: {
          line1: form.get("line1"),
          city: form.get("city"),
          notes: form.get("notes") || null,
        },
        // Only ids and counts. The server prices the order itself.
        items: lines.map((line) => ({
          product_id: line.productId,
          variant_id: line.variantId,
          quantity: line.quantity,
        })),
      });
      lines.forEach((line) => track({ type: "purchase", product_id: line.productId }));
      clear();
      router.replace(`/${lang}/track/${order.tracking_token}`);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : t("somethingWentWrong"));
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="page pt-6 pb-10">
      <h1 className="text-[26px] font-semibold tracking-tight">{t("checkout")}</h1>

      <div className="mt-6 space-y-4">
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
            // A numeric keypad on a phone, and the browser's own saved number.
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0612345678"
            className="field"
          />
          <p className="mt-1.5 text-[13px] text-ink-soft">{t("phoneHint")}</p>
        </div>

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
          <input id="line1" name="line1" required autoComplete="street-address" className="field" />
        </div>

        <div>
          <label className="label" htmlFor="email">
            {t("yourEmail")}
          </label>
          <input id="email" name="email" type="email" autoComplete="email" className="field" />
        </div>

        <div>
          <label className="label" htmlFor="notes">
            {t("anythingElse")}
          </label>
          <textarea id="notes" name="notes" rows={2} className="field resize-none" />
        </div>
      </div>

      <div className="mt-7 card p-5 shadow-soft">
        <div className="flex justify-between text-[17px] font-semibold">
          <span>{t("total")}</span>
          <span className="stamp">{money(total + (total >= 500 ? 0 : 30), lang)}</span>
        </div>
        <p className="mt-2 text-[14px] text-ink-soft leading-relaxed">{t("payAtDoor")}</p>
      </div>

      {problem ? (
        <p role="alert" className="mt-4 text-[15px] text-warn">
          {problem}
        </p>
      ) : null}

      <button type="submit" disabled={sending} className="btn-primary w-full mt-6">
        {sending ? t("placing") : t("placeOrder")}
      </button>
    </form>
  );
}
