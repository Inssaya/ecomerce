"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useCart } from "./CartProvider";
import { Assistant } from "./Assistant";
import { loadDelivery } from "@/lib/delivery";
import { ensureVisitorCookie } from "@/lib/fingerprint";
import { setSignalLanguage } from "@/lib/signals";
import { type Lang, translator } from "@/lib/i18n";

/**
 * The frame around every page.
 *
 * One bar, at the bottom, where a thumb is. The top of a phone screen is the
 * hardest place to reach one-handed and it is where most shops put their
 * navigation.
 */
export function Chrome({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = translator(lang);
  const path = usePathname();
  const { count } = useCart();

  useEffect(() => {
    setSignalLanguage(lang);
    void ensureVisitorCookie();
    // Warmed here so the cart and the checkout have the delivery terms before
    // anybody reaches them. Both pages refuse to print a price they have had
    // to guess, and this is what stops that showing as a dash.
    void loadDelivery(lang).catch(() => undefined);
  }, [lang]);

  const other: Lang = lang === "ar" ? "en" : "ar";
  const swapped = path.replace(`/${lang}`, `/${other}`);
  const on = (segment: string) => path === `/${lang}${segment}`;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-cream/85 backdrop-blur-md">
        <div className="page flex items-center justify-between h-14">
          <Link href={`/${lang}`} className="text-[17px] font-semibold tracking-tight">
            MoStyle
          </Link>
          <Link
            href={swapped}
            className="tap text-[13px] font-medium text-ink-soft px-2"
            // The label is the language you would switch *to*, written in
            // that language — anything else is a puzzle.
            lang={other}
          >
            {other === "ar" ? "العربية" : "English"}
          </Link>
        </div>
      </header>

      <main className="flex-1 pb-28 animate-fade">{children}</main>

      <nav
        className="fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur-md border-t border-sand"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="page flex items-stretch justify-around h-16">
          <Tab href={`/${lang}/store`} active={on("/store")} label={t("theShelf")} />
          <Tab href={`/${lang}/ask`} active={on("/ask")} label={t("theWorkshop")} />
          <Tab
            href={`/${lang}/cart`}
            active={on("/cart")}
            label={t("cart")}
            badge={count || undefined}
          />
        </div>
      </nav>

      <Assistant lang={lang} />
    </div>
  );
}

function Tab({
  href,
  active,
  label,
  badge,
}: {
  href: string;
  active: boolean;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`tap flex-1 flex-col gap-0.5 text-[13px] font-medium transition-colors duration-gentle ${
        active ? "text-clay" : "text-ink-soft"
      }`}
    >
      <span className="relative">
        {label}
        {badge ? (
          <span className="absolute -top-1.5 -end-4 min-w-[18px] h-[18px] px-1 rounded-full bg-clay text-white text-[11px] leading-[18px] text-center">
            {badge}
          </span>
        ) : null}
      </span>
      <span
        className={`block h-[2px] w-6 rounded-full transition-all duration-gentle ${
          active ? "bg-clay" : "bg-transparent"
        }`}
      />
    </Link>
  );
}
