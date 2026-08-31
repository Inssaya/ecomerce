import Link from "next/link";

import { type Lang, translator } from "@/lib/i18n";

/**
 * The bottom of every page.
 *
 * There was none at all before this. That left four genuinely good pages
 * unreachable from anywhere in the navigation — the delivery terms (which
 * answer the exact fear that kills a cash-on-delivery sale), the per-city
 * pages, the service pages, and `/orders`, the way back in for somebody who
 * lost their tracking link. It also left the page ending on nothing, which
 * for a one-person workshop asking strangers to hand cash to a courier is
 * the loudest "this might not be a real business" signal a site can send.
 *
 * The contact details are passed in rather than imported live: the layout
 * already fetches them once for `Chrome`, and a second fetch here would
 * double the request on every page for a value that never changes mid-visit.
 */
export function Footer({
  lang,
  contact,
}: {
  lang: Lang;
  contact: { email: string; phone: string };
}) {
  const t = translator(lang);
  const phoneTel = `+212${contact.phone.replace(/^0/, "")}`;

  return (
    <footer className="border-t border-sand bg-surface">
      <div className="page-wide py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:pe-6">
            <p className="stamp text-[17px] font-semibold tracking-[-0.01em]">{t("tagline")}</p>
            <p className="mt-2.5 max-w-[34ch] text-[14px] leading-[1.65] text-ink-soft">
              {t("footerMade")}
            </p>
          </div>

          <nav aria-label={t("footerShop")}>
            <h2 className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
              {t("footerShop")}
            </h2>
            <ul className="mt-3.5 space-y-2.5 text-[14.5px]">
              <li>
                <Link href={`/${lang}`} className="text-ink-soft hover:text-ink">
                  {t("navShop")}
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/ask`} className="text-ink-soft hover:text-ink">
                  {t("navCustom")}
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/how-we-work`} className="text-ink-soft hover:text-ink">
                  {t("navAbout")}
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label={t("footerHelp")}>
            <h2 className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
              {t("footerHelp")}
            </h2>
            <ul className="mt-3.5 space-y-2.5 text-[14.5px]">
              <li>
                <Link href={`/${lang}/delivery`} className="text-ink-soft hover:text-ink">
                  {t("footerDelivery")}
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/orders`} className="text-ink-soft hover:text-ink">
                  {t("footerFindOrder")}
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/contact`} className="text-ink-soft hover:text-ink">
                  {t("navContact")}
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
              {t("footerReach")}
            </h2>
            {/* Written out, not only hidden behind a mailto:. Somebody who
                wants to save the number or paste it into their own WhatsApp
                has to be able to read it. */}
            <ul className="mt-3.5 space-y-2.5 text-[14.5px]" dir="ltr">
              <li>
                <a href={`tel:${phoneTel}`} className="text-ink-soft hover:text-ink">
                  {contact.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${contact.email}`} className="text-ink-soft hover:text-ink">
                  {contact.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-sand pt-6 text-[13.5px] text-ink-mute">
          {t("footerCod")}
        </p>
      </div>
    </footer>
  );
}
