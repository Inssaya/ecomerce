import type { Metadata } from "next";

import { ContactComposer } from "@/components/ContactComposer";
import { FALLBACK_CONTACT } from "@/lib/contact";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { alternates, contact, siteUrl } from "@/lib/server";

/**
 * Where the workshop can be reached.
 *
 * One way in: the form. There used to be two cards beside it — "Open
 * WhatsApp" and "Send email" — which were the same message asked for twice.
 * A visitor who has already written what they want does not want to be
 * handed a choice of apps to retype it into, and anything sent that way
 * arrives outside the shop entirely, so nothing in the console knows it
 * happened. The form sends, the workshop is emailed, and the sender gets a
 * receipt.
 *
 * The phone number and address still appear, in the footer, as text somebody
 * can read and dial — which is what a "contact us" card was pretending to be.
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  return {
    title: `${t("navContact")} — MoStyle`,
    description: t("contactIntro"),
    alternates: alternates(lang, "/contact"),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${lang}/contact`,
      title: `${t("navContact")} — MoStyle`,
      description: t("contactIntro"),
    },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";
  const shopContact = (await contact(lang)) ?? FALLBACK_CONTACT;
  const emailHref = `mailto:${shopContact.email}`;

  return (
    <div className="page-wide pt-8 pb-16">
      {/* No headline, no standfirst. A page reached by clicking "Contact" does
          not need half a screen explaining that it is the contact page, and the
          paragraph that stood here was three lines of narration about what the
          three panels below it already are. The name stays for screen readers
          and for the page outline, and nowhere else. */}
      <h1 className="sr-only">{t("navContact")}</h1>

      <div className="mx-auto max-w-[720px]">
        <ContactComposer lang={lang} />

        {/* The details as text, for somebody who would rather just dial. Not a
            card pretending to be an action — a phone number you can read. */}
        <p className="mt-5 text-center text-[14px] leading-relaxed text-ink-soft">
          {ar ? "أو اتصل بنا مباشرة: " : "Or reach us directly: "}
          {shopContact.phone ? (
            <a href={`tel:${shopContact.phone}`} className="underline underline-offset-4">
              {shopContact.phone}
            </a>
          ) : null}
          {shopContact.phone ? " · " : null}
          <a href={emailHref} className="underline underline-offset-4">
            {shopContact.email}
          </a>
        </p>
      </div>
    </div>
  );
}
