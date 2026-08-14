import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Instrument_Serif, Schibsted_Grotesk } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import "@/app/globals.css";
import { Chrome } from "@/components/Chrome";
import { CartProvider } from "@/components/CartProvider";
import { AmbientProvider } from "@/components/ambient";
import { type Lang, dir, isLang, translator } from "@/lib/i18n";
import { alternates, siteUrl } from "@/lib/server";

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
const text = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-text",
  display: "swap",
});

/**
 * Arabic is not covered by Schibsted Grotesk, so it keeps its own face.
 *
 * Declared *after* the Latin face and applied through `--font-arabic`, which
 * `[dir="rtl"]` puts first in the stack. Dropping this would not fall back
 * gracefully — it would render Arabic in whatever the device happened to have,
 * which is the "translation layer bolted on" the brief rules out.
 */
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-arabic",
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
const stamp = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
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
  const language = isLang(lang) ? lang : "en";
  const t = translator(language);
  const title = `MoStyle — ${t("tagline")}`;
  return {
    // Everything below, and every page under this layout, may then write
    // relative URLs — Next makes them absolute against this. Metadata that is
    // relative is silently ignored by WhatsApp and by Google.
    metadataBase: new URL(siteUrl),
    title,
    description: t("taglineSupport"),
    applicationName: "MoStyle",
    alternates: alternates(language),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: language === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${language}`,
      title,
      description: t("taglineSupport"),
    },
    // No `robots` here on purpose.
    //
    // "index, follow" is what a crawler already assumes, so declaring it wins
    // nothing — and it was being inherited by pages that must not be indexed.
    // A missing piece renders the not-found page, on which Next emits
    // `noindex`; with this line present the same document carried both
    // directives and left a machine to decide which the shop meant. The
    // private pages set their own noindex through `privatePage`.
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
    <html
      lang={language}
      dir={dir(language)}
      className={`${text.variable} ${arabic.variable} ${stamp.variable}`}
    >
      <body className={text.className}>
        <AmbientProvider>
          <CartProvider>
            <Chrome lang={language}>{children}</Chrome>
          </CartProvider>
        </AmbientProvider>
      </body>
    </html>
  );
}
