import type { Metadata } from "next";
import { Inter, Noto_Naskh_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { Chrome } from "@/components/Chrome";
import { CartProvider } from "@/components/CartProvider";
import { type Lang, dir, isLang, translator } from "@/lib/i18n";

const latin = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const arabic = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
});

export function generateStaticParams() {
  return [{ lang: "en" }, { lang: "ar" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = translator(isLang(lang) ? lang : "en");
  return {
    title: `MoStyle — ${t("tagline")}`,
    description: t("taglineSupport"),
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // The colour of the browser chrome on a phone, so the page does not end at
  // a hard white edge.
  themeColor: "#FAF6F0",
  // Zoom stays available. Disabling it locks out anyone who needs it.
  maximumScale: 5,
};

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const language = lang as Lang;

  return (
    <html lang={language} dir={dir(language)} className={`${latin.variable} ${arabic.variable}`}>
      <body className={language === "ar" ? "font-[var(--font-arabic)]" : latin.className}>
        <CartProvider>
          <Chrome lang={language}>{children}</Chrome>
        </CartProvider>
      </body>
    </html>
  );
}
