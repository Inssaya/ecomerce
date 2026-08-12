"use client";

import Image from "next/image";
import Link from "next/link";
import { use } from "react";

import { useCart } from "@/components/CartProvider";
import { feeFor, useDelivery } from "@/lib/delivery";
import { type Lang, isLang, money, translator } from "@/lib/i18n";

/**
 * The cart.
 *
 * The delivery fee is shown here, before checkout, on purpose: a cost the
 * customer meets for the first time at their door is a package they refuse.
 * It is asked of the server rather than assumed — this page used to carry its
 * own `DELIVERY_FEE = 30`, which was right until the day somebody changed the
 * setting, and wrong silently ever after.
 */
export default function CartPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const { lines, total, setQuantity, remove, idOf, ready } = useCart();
  const terms = useDelivery(lang);

  // The cart used to re-fetch each line on every visit and warn "only 2 left"
  // or "this one has sold out". The shop no longer counts units — if a shelf
  // piece is physically gone, the workshop calls the buyer after the order —
  // so there is nothing here to check and no notice to show.

  if (!ready) return <div className="page pt-10" aria-hidden />;

  if (lines.length === 0) {
    return (
      <div className="page pt-20 text-center">
        <p className="text-[17px] text-ink-soft">{t("cartEmpty")}</p>
        <Link href={`/${lang}`} className="btn-quiet mt-6">
          {t("browse")}
        </Link>
      </div>
    );
  }

  // Null until the shop has said what it charges. A number invented locally
  // while waiting would be a number the customer might read and act on.
  const fee = terms ? feeFor(total, terms) : null;

  return (
    <div className="page-wide pt-6 pb-32 lg:max-w-[1020px] lg:pb-16">
      <h1 className="text-[21px] font-semibold tracking-[-0.01em]">{t("yourCart")}</h1>

      {/* Two columns from `lg` up: the lines on the left, the totals and the way
          out on the right. Below that it is one column with the action pinned to
          the bottom of the screen, which is right on a phone and absurd across a
          laptop. */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
      <ul className="space-y-3">
        {lines.map((line) => {
          const id = idOf(line);
          // Their choices, one per row, so the cart shows exactly what was
          // picked at add-to-cart time — a piece bought in "Red / M" reads
          // as "Red · M", not as a mystery line.
          const picks = [
            line.option || null,
            ...line.selection.map((pick) => (pick.name ? `${pick.name}: ${pick.value}` : pick.value)),
            line.personalization ? `“${line.personalization}”` : null,
          ].filter(Boolean) as string[];
          return (
            <li key={id} className="card flex gap-3 p-3 shadow-soft">
              <div className="relative h-20 w-20 shrink-0 rounded-2xl overflow-hidden bg-clay-soft">
                {line.image ? (
                  <Image src={line.image} alt={line.title} fill sizes="80px" className="object-cover" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium leading-snug line-clamp-2">{line.title}</p>
                {picks.length > 0 ? (
                  <p className="text-[13px] text-ink-soft">{picks.join(" · ")}</p>
                ) : null}
                <p className="stamp mt-0.5 text-[15px] font-semibold">{money(line.price, lang)}</p>

                <div className="mt-2 flex items-center gap-1">
                  <Stepper label="−" onClick={() => setQuantity(id, line.quantity - 1)} />
                  <span className="stamp w-9 text-center text-[15px]">{line.quantity}</span>
                  <Stepper label="+" onClick={() => setQuantity(id, line.quantity + 1)} />
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    className="tap ms-auto px-3 text-[13px] text-ink-soft"
                  >
                    ×
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="card p-5 shadow-soft lg:sticky lg:top-20">
        <dl className="space-y-2 text-[15px]">
          <Row label={t("subtotal")} value={money(total, lang)} />
          <Row
            label={t("delivery")}
            value={fee === null ? "—" : fee === 0 ? t("freeDelivery") : money(fee, lang)}
          />
          <Row label={t("total")} value={fee === null ? "—" : money(total + fee, lang)} strong />
        </dl>

        <p className="mt-4 text-[14px] text-ink-soft leading-relaxed">{t("payAtDoor")}</p>
        {/* Where the doubt actually is. A buyer deciding whether to commit to
            cash at the door wants to know what happens if they say no — and
            answering it here prevents the refusal, which costs far more than the
            sale it might lose. */}
        <p className="mt-2 text-[13px]">
          <Link href={`/${lang}/delivery`} className="text-ink-soft underline underline-offset-4">
            {lang === "ar" ? "ماذا لو لم تعجبني؟" : "What if I don't want it?"}
          </Link>
        </p>

        <Link href={`/${lang}/checkout`} className="btn-primary mt-5 hidden w-full lg:inline-flex">
          {t("checkout")}
        </Link>
      </aside>
      </div>

      {/* Pinned to the actual bottom of the viewport on a phone. It used to sit
          at `bottom-16`, clearing a tab bar that no longer exists, leaving a
          strip of page scrolling underneath it. */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t border-sand bg-cream/90 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="page-wide flex items-center gap-4 py-3">
          <div className="min-w-0">
            <p className="text-[12px] text-ink-soft">{t("total")}</p>
            <p className="stamp text-[16px] font-semibold leading-tight">
              {fee === null ? "—" : money(total + fee, lang)}
            </p>
          </div>
          <Link
            href={`/${lang}/checkout`}
            className="btn-primary ms-auto w-[58%] max-w-[240px]"
          >
            {t("checkout")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stepper({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap h-9 w-9 rounded-xl bg-clay-soft text-[17px] disabled:opacity-35"
    >
      {label}
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-[17px] font-semibold pt-2 border-t border-sand" : ""}`}>
      <dt className={strong ? "" : "text-ink-soft"}>{label}</dt>
      <dd className="stamp">{value}</dd>
    </div>
  );
}
