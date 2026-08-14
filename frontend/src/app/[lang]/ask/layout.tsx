import type { Metadata } from "next";
import type { ReactNode } from "react";

import { type Lang, isLang, translator } from "@/lib/i18n";
import { alternates, siteUrl } from "@/lib/server";

/**
 * The Workshop door, which is the half of the shop no reseller can copy —
 * so it is worth being findable for the searches nobody else can answer:
 * someone looking for a thing that is not sold anywhere.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const title = `${t("theWorkshop")} — MoStyle`;
  const description = `${t("tellUsLead")}`;

  return {
    title,
    description,
    alternates: alternates(lang, "/ask"),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${lang}/ask`,
      title,
      description,
    },
  };
}

export default function AskLayout({ children }: { children: ReactNode }) {
  return children;
}
