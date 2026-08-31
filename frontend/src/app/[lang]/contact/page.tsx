import type { Metadata } from "next";
import Link from "next/link";

import { ContactComposer } from "@/components/ContactComposer";
import { FALLBACK_CONTACT } from "@/lib/contact";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { alternates, contact, siteUrl, workshopPhone } from "@/lib/server";

/**
 * Where the workshop can be reached.
 *
 * Three ways in: the form, WhatsApp, email. The buyer-facing AI concierge
 * that used to sit in a card on this page has been removed — it was a
 * customer-facing chat feature the shop no longer offers.
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
  const digits = workshopPhone?.replace(/\D/g, "") ?? null;
  const whatsappHref = digits ? `https://wa.me/${digits}` : null;
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <ContactComposer lang={lang} whatsappNumber={digits} contactEmail={shopContact.email} />

        <aside className="space-y-4">
          <Panel
            title="WhatsApp"
            body={ar ? "أسرع طريقة، ومناسبة للصور السريعة والملاحظات القصيرة." : "Fastest for photos and quick notes."}
            action={ar ? "افتح WhatsApp" : "Open WhatsApp"}
            href={whatsappHref ?? `/${lang}/ask`}
          />
          <Panel
            title="Email"
            body={ar ? "أفضل للرسائل الطويلة أو الملفات والشرح الهادئ." : "Best for longer notes, files and a calmer brief."}
            action={ar ? "أرسل بريدًا" : "Send email"}
            href={emailHref}
          />
        </aside>
      </div>
    </div>
  );
}

function Panel({
  title,
  body,
  action,
  href,
}: {
  title: string;
  body: string;
  action: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-sand bg-surface p-5
                 transition-all duration-300 hover:-translate-y-0.5 hover:border-ink"
    >
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{body}</p>
      <p className="mt-3 text-[14px] font-medium text-clay">{action} →</p>
    </Link>
  );
}
