import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { Chrome } from "@/components/Chrome";
import { CartProvider } from "@/components/CartProvider";
import { type Lang, dir, isLang, translator } from "@/lib/i18n";

/**
 * One family for both scripts.
 *
 * The first draft paired Inter with a separate Arabic face, which is two
 * mistakes at once. Inter is the single most recognisable tell of a generated
 * design — it is what every AI-built site defaults to — and pairing a Latin
 * webfont with an unrelated Arabic one almost never matches optically, because
 * the two were drawn by different hands for different proportions.
 *
 * IBM Plex Sans Arabic carries Latin and Arabic drawn together, for interfaces.
 * Neither script dominates and there is nothing to keep in sync.
 */
const text = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-text",
  display: "swap",
});

/**
 * The workshop's own hand.
 *
 * A workshop numbers what it makes. Every number on this site — a piece's
 * 04/12, an order reference, a price, a count — is set in the mono cut of the
 * same superfamily, so the numerals read as stamped rather than typed. This is
 * the one place the design is allowed to be loud; everything around it stays
 * quiet.
 */
const stamp = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-stamp",
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
    <html lang={language} dir={dir(language)} className={`${text.variable} ${stamp.variable}`}>
      <body className={text.className}>
        <CartProvider>
          <Chrome lang={language}>{children}</Chrome>
        </CartProvider>
      </body>
    </html>
  );
}
