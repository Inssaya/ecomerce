import type { Metadata } from "next";
import Link from "next/link";

import { ContactComposer } from "@/components/ContactComposer";
import { ChatPanel } from "@/components/ChatPanel";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { alternates, siteUrl, workshopPhone } from "@/lib/server";

/**
 * Where the workshop can be reached.
 *
 * The concierge lives here and nowhere else. It was a floating button on every
 * page, which put an AI bill on every idle visitor; on this page the people who
 * open it are the people who came looking for an answer.
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
  const emailHref = "mailto:workshop@mostyle.ma";

  return (
    <div className="page-wide pt-8 pb-16">
      {/* No headline, no standfirst. A page reached by clicking "Contact" does
          not need half a screen explaining that it is the contact page, and the
          paragraph that stood here was three lines of narration about what the
          three panels below it already are. The name stays for screen readers
          and for the page outline, and nowhere else. */}
      <h1 className="sr-only">{t("navContact")}</h1>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <ContactComposer lang={lang} whatsappNumber={digits} />

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
          <div className="rounded-2xl border border-sand bg-surface p-5">
            <p className="text-[16px] font-semibold">{ar ? "المساعد" : "Assistant"}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
              {ar
                ? "هنا فقط للمساعدة في الصياغة أو الإجابة السريعة. إذا أردت طلبًا فعليًا، استخدم النموذج أعلاه أو WhatsApp / email."
                : "Only for help with wording or a quick answer. If you want to place a real request, use the form above or WhatsApp / email."}
            </p>
            <div className="mt-4 rounded-[18px] border border-sand bg-cream p-3">
              <ChatPanel lang={lang} />
            </div>
          </div>
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
