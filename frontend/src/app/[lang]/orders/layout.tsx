import type { Metadata } from "next";
import type { ReactNode } from "react";

import { type Lang, isLang, translator } from "@/lib/i18n";
import { alternates } from "@/lib/server";

/**
 * The form is indexable — someone searching "mostyle track my order" should
 * land here. What it *finds* is not: `/track/[token]` is noindex, so the page
 * that lists nothing is public and the page with a name and an address on it
 * is not.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  return {
    title: `${t("findYourOrder")} — MoStyle`,
    description: t("findYourOrderLead"),
    alternates: alternates(lang, "/orders"),
  };
}

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return children;
}
