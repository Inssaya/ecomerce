"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { CategoryRail } from "./CategoryRail";
import { useCart } from "./CartProvider";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";
import { loadDelivery } from "@/lib/delivery";
import { ensureVisitorCookie } from "@/lib/fingerprint";
import { setSignalLanguage } from "@/lib/signals";
import { useSession } from "@/lib/session";
import { type Lang, translator } from "@/lib/i18n";

/**
 * The frame around every page.
 *
 * One bar, left to right: the mark, the five places, then — pushed to the far
 * end — filter, search, account, bag. The bag is last because it is the exit,
 * and filter sits immediately before search because the two are one thought:
 * narrow the shelf, then name what you want on it.
 *
 * The concierge is deliberately not here. A floating button on every page is an
 * invitation to play with it and every message costs money at an AI provider,
 * so it lives on `/contact`, behind a sign-in.
 */
export function Chrome({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = translator(lang);
  const path = usePathname();
  const { count } = useCart();
  const { session } = useSession();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    setSignalLanguage(lang);
    void ensureVisitorCookie();
    // Warmed here so the cart and the checkout have the delivery terms before
    // anybody reaches them.
    void loadDelivery(lang).catch(() => undefined);
  }, [lang]);

  useEffect(() => setMenu(false), [path]);

  const other: Lang = lang === "ar" ? "en" : "ar";
  const swapped = path.replace(`/${lang}`, `/${other}`);

  // The shop is the front door now, so "Shop" points at it and there is no
  // second entry for a `/store` that no longer exists.
  const places = [
    { href: `/${lang}`, label: t("navShop"), exact: true },
    { href: `/${lang}/ask`, label: t("navCustom"), exact: false },
    { href: `/${lang}/how-we-work`, label: t("navAbout"), exact: false },
    { href: `/${lang}/contact`, label: t("navContact"), exact: false },
  ];
  const on = (href: string, exact: boolean) =>
    exact ? path === href : path === href || path.startsWith(`${href}/`);

  // Exactly the shelf, because that is the only page listening for the event
  // this button fires. Elsewhere it would be a control that does nothing,
  // which is worse than no control at all.
  const shopping = path === `/${lang}`;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 bg-cream/85 backdrop-blur-md border-b border-sand">
        <div className="mx-auto w-full max-w-[1440px] px-5">
          <div className="flex items-center gap-2.5 h-16">
            <Link
              href={`/${lang}`}
              aria-label="MoStyle"
              className="flex items-center gap-2 shrink-0 me-1"
            >
              <Logo className="h-8 w-8" />
              <span className="hidden sm:inline text-[20px] font-bold tracking-[-0.035em]">
                MoStyle<span className="text-clay">.</span>
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-5 shrink-0">
              {places.map((place) => (
                <Link
                  key={place.href}
                  href={place.href}
                  aria-current={on(place.href, place.exact) ? "page" : undefined}
                  className={`text-[14.5px] font-medium py-1.5 border-b-[1.5px] transition-colors duration-200 ${
                    on(place.href, place.exact)
                      ? "text-ink border-clay"
                      : "text-ink-soft border-transparent hover:text-ink"
                  }`}
                >
                  {place.label}
                </Link>
              ))}
            </nav>

            {/* Everything from here is pushed to the far end. */}
            <div className="flex items-center gap-2 ms-auto min-w-0">
              {/* In front of the search bar: narrow the shelf, then name what
                  you want on it — the two are one thought. */}
              {shopping ? (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("mostyle:filter"))}
                  aria-label={t("filter")}
                  title={t("filter")}
                  className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-full
                             border border-sand bg-surface text-ink-soft
                             transition-colors duration-200 hover:text-ink hover:border-ink"
                >
                  <FilterIcon />
                </button>
              ) : null}

              {/* `useSearchParams()` lives inside this component, which is
                  why it needs the boundary: without it, every otherwise-static
                  page `Chrome` wraps — `/ask`, `/how-we-work`, and the rest —
                  would be forced into client-side rendering just to draw a
                  search box none of them use the query string for. */}
              <Suspense
                fallback={
                  <div className="h-10 w-[130px] sm:w-[210px] rounded-full bg-surface border border-sand" />
                }
              >
                <SearchBox lang={lang} />
              </Suspense>

              {session ? (
                <Link
                  href={`/${lang}/account/profile`}
                  aria-label={session.email}
                  title={session.email}
                  className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-full
                             border border-sand bg-surface text-ink-soft
                             transition-colors duration-200 hover:text-ink hover:border-ink"
                >
                  <UserIcon />
                </Link>
              ) : (
                <Link
                  href={`/${lang}/account`}
                  className="hidden sm:inline-flex tap shrink-0 px-2 text-[14px] font-medium
                             text-ink-soft hover:text-ink"
                >
                  {t("signIn")}
                </Link>
              )}

              <Link
                href={swapped}
                className="hidden sm:inline-flex tap shrink-0 px-1 text-[13px] font-medium text-ink-soft"
                lang={other}
              >
                {other === "ar" ? "ع" : "EN"}
              </Link>

              {/* Last, at the far end: the bag. */}
              <Link
                href={`/${lang}/cart`}
                aria-label={t("cart")}
                className="inline-flex items-center gap-2 h-10 ps-3.5 pe-3 shrink-0 rounded-full
                           bg-ink text-white transition-colors duration-200 hover:bg-clay"
              >
                <BagIcon />
                <span className="min-w-[20px] h-5 rounded-full bg-white/20 text-[12px] leading-5 text-center px-1">
                  {count}
                </span>
              </Link>

              <button
                type="button"
                onClick={() => setMenu((open) => !open)}
                aria-expanded={menu}
                aria-label={t("navShop")}
                className="lg:hidden tap shrink-0 -me-2 text-ink"
              >
                <MenuIcon open={menu} />
              </button>
            </div>
          </div>

          {menu ? (
            <nav className="lg:hidden pb-3 flex flex-col animate-fade">
              {places.map((place) => (
                <Link
                  key={place.href}
                  href={place.href}
                  className={`py-2.5 text-[15px] font-medium border-b border-sand ${
                    on(place.href, place.exact) ? "text-clay" : "text-ink"
                  }`}
                >
                  {place.label}
                </Link>
              ))}
              <Link
                href={session ? `/${lang}/account/profile` : `/${lang}/account`}
                className="py-2.5 text-[15px] font-medium text-ink-soft"
              >
                {session ? t("profile") : t("signIn")}
              </Link>
              <Link href={swapped} lang={other} className="py-2.5 text-[15px] font-medium text-ink-soft">
                {other === "ar" ? "العربية" : "English"}
              </Link>
            </nav>
          ) : null}
        </div>
      </header>

      {/* Desktop only, and only on the shop itself — see the component for
          why this is a floating column of marks rather than a sidebar. */}
      {shopping ? (
        <Suspense fallback={null}>
          <CategoryRail lang={lang} />
        </Suspense>
      ) : null}

      <main className={`flex-1 pb-16 animate-fade ${shopping ? "lg:pe-16" : ""}`}>{children}</main>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      ) : (
        <>
          <path d="M3 12h18" />
          <path d="M3 6h18" />
          <path d="M3 18h18" />
        </>
      )}
    </svg>
  );
}
