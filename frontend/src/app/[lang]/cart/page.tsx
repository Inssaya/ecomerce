"use client";

import Image from "next/image";
import Link from "next/link";
import { use } from "react";

import { useCart } from "@/components/CartProvider";
import { type Lang, isLang, money, translator } from "@/lib/i18n";

const FREE_DELIVERY_OVER = 500;
const DELIVERY_FEE = 30;

/**
 * The cart.
 *
 * The delivery fee is shown here, before checkout, on purpose: a cost the
 * customer meets for the first time at their door is a package they refuse.
 */
export default function CartPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const { lines, total, setQuantity, remove, ready } = useCart();

  if (!ready) return <div className="page pt-10" aria-hidden />;

  if (lines.length === 0) {
    return (
      <div className="page pt-20 text-center">
        <p className="text-[17px] text-ink-soft">{t("cartEmpty")}</p>
        <Link href={`/${lang}/store`} className="btn-quiet mt-6">
          {t("browse")}
        </Link>
      </div>
    );
  }

  const fee = total >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;

  return (
    <div className="page pt-6 pb-32">
      <h1 className="text-[26px] font-semibold tracking-tight">{t("yourCart")}</h1>

      <ul className="mt-6 space-y-3">
        {lines.map((line) => (
          <li key={`${line.productId}:${line.variantId}`} className="card flex gap-3 p-3 shadow-soft">
            <div className="relative h-20 w-20 shrink-0 rounded-2xl overflow-hidden bg-clay-soft">
              {line.image ? (
                <Image src={line.image} alt={line.title} fill sizes="80px" className="object-cover" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium leading-snug line-clamp-2">{line.title}</p>
              {line.option ? <p className="text-[13px] text-ink-soft">{line.option}</p> : null}
              <p className="stamp mt-0.5 text-[15px] font-semibold">{money(line.price, lang)}</p>

              <div className="mt-2 flex items-center gap-1">
                <Stepper
                  label="−"
                  onClick={() => setQuantity(line.productId, line.variantId, line.quantity - 1)}
                />
                <span className="stamp w-9 text-center text-[15px]">{line.quantity}</span>
                <Stepper
                  label="+"
                  disabled={line.available !== null && line.quantity >= line.available}
                  onClick={() => setQuantity(line.productId, line.variantId, line.quantity + 1)}
                />
                <button
                  type="button"
                  onClick={() => remove(line.productId, line.variantId)}
                  className="tap ms-auto px-3 text-[13px] text-ink-soft"
                >
                  ×
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-7 space-y-2 text-[15px]">
        <Row label={t("subtotal")} value={money(total, lang)} />
        <Row label={t("delivery")} value={fee === 0 ? t("freeDelivery") : money(fee, lang)} />
        <Row label={t("total")} value={money(total + fee, lang)} strong />
      </dl>

      <p className="mt-4 text-[14px] text-ink-soft leading-relaxed">{t("payAtDoor")}</p>

      <div
        className="fixed bottom-16 inset-x-0 z-10 bg-cream/90 backdrop-blur-md border-t border-sand"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="page py-3">
          <Link href={`/${lang}/checkout`} className="btn-primary w-full">
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
