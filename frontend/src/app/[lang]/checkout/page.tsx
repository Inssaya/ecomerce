"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { useCart } from "@/components/CartProvider";
import { api, ApiError } from "@/lib/api";
import { feeFor, matchCity, useDelivery } from "@/lib/delivery";
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
  const terms = useDelivery(lang);

  const [city, setCity] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The city decides the fee and the date, so both are recomputed as it is
  // typed. `place` is null until what they have written matches somewhere we
  // have actually made a promise about — everywhere else pays the shop's fee
  // and is told no date, because we have not earned the right to name one.
  const place = terms ? matchCity(terms.cities, city) : null;
  const fee = terms ? feeFor(total, terms, city) : null;

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
          {/* Suggestions, not a menu. The city list is the twenty-nine places
              this shop will put a delivery window in writing for — but a
              dropdown that does not contain someone's town loses the order, so
              this stays free text and merely offers help. */}
          <input
            id="city"
            name="city"
            required
            autoComplete="address-level2"
            list="known-cities"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="field"
          />
          <datalist id="known-cities">
            {(terms?.cities ?? []).map((known) => (
              <option key={known.slug} value={known.name} />
            ))}
          </datalist>
          {place ? (
            <p className="mt-1.5 text-[13px] text-ink-soft">
              {lang === "ar"
                ? `${place.name}: التوصيل خلال ${place.delivery_days[0]}–${place.delivery_days[1]} أيام.`
                : `${place.name}: delivered in ${place.delivery_days[0]}–${place.delivery_days[1]} days.`}
            </p>
          ) : null}
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
        {/* Broken out rather than summed into one figure: at the door the
            customer hands over cash against this line, and "why is it more
            than the pieces cost" is the question that gets a package refused.
            The fee is whatever that city actually costs — the same number the
            city's own page publishes, from the same place the till reads. */}
        <div className="flex justify-between text-[15px] text-ink-soft">
          <span>{t("delivery")}</span>
          <span className="stamp">
            {fee === null ? "—" : fee === 0 ? t("freeDelivery") : money(fee, lang)}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-[17px] font-semibold">
          <span>{t("total")}</span>
          <span className="stamp">{fee === null ? "—" : money(total + fee, lang)}</span>
        </div>
        <p className="mt-2 text-[14px] text-ink-soft leading-relaxed">{t("payAtDoor")}</p>
      {/* Where the doubt actually is. A buyer deciding whether to commit to
          cash at the door wants to know what happens if they say no — and
          answering it here prevents the refusal, which costs far more than the
          sale it might lose. */}
      <p className="mt-2 text-[13px]">
        <Link href={`/${lang}/delivery`} className="text-ink-soft underline underline-offset-4">
          {lang === "ar" ? "ماذا لو لم تعجبني؟" : "What if I don't want it?"}
        </Link>
      </p>
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
