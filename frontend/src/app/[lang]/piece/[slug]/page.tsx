import type { Metadata } from "next";

import type { PieceDetail } from "@/lib/api";
import { type Lang, isLang, money, translator } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, siteUrl } from "@/lib/server";

import { PieceView } from "./PieceView";

/**
 * The piece page, rendered on the server so it can be shared and found.
 *
 * This screen was a client component, which meant the HTML anyone else
 * received was empty: no title, no photo, no price. Two things broke because
 * of that, and both of them matter more here than almost anywhere.
 *
 * The first is WhatsApp. In Morocco a piece is sold by someone sending the
 * link to a cousin, and a link that unfurls as a grey box with a domain name
 * is a link nobody taps. The card below — real photo, real title, real price —
 * is the shop's cheapest and most-used shop window.
 *
 * The second is Google, which will index what it is given and was being given
 * nothing.
 *
 * The interactive half stays in `PieceView`. This file only fetches once,
 * hands it down as the first paint, and describes it.
 */
async function piece(lang: Lang, slug: string): Promise<PieceDetail | null> {
  return fromApi<PieceDetail>(`/products/${slug}`, lang);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang: raw, slug } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const found = await piece(lang, slug);

  if (!found) return { title: t("notFound") };

  // What is actually true about it, in one line: the price, and either how
  // many are left or how long it takes to make. No adjectives — the photo
  // does that job, and a claim we cannot keep is worse than no claim.
  const madeOrLeft =
    found.kind === "workshop"
      ? t("readyInDays", { n: found.lead_time_days ?? 0 })
      : (found.available ?? 0) === 0
        ? t("allGone")
        : t("onlyMade", { n: found.pieces.length || (found.available ?? 0), left: found.available ?? 0 });

  const description = `${money(found.price, lang)} · ${madeOrLeft} ${found.description || t("taglineSupport")}`
    .replace(/\s+/g, " ")
    .slice(0, 200);
  const path = `/${lang}/piece/${found.slug}`;

  return {
    title: `${found.title} — MoStyle`,
    description,
    // The same piece in both languages, declared to each other and with an
    // x-default. Without this Google treats them as two competing pages for
    // the same thing.
    alternates: alternates(lang, `/piece/${found.slug}`),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}${path}`,
      title: found.title,
      description,
      images: found.images.slice(0, 1).map((image) => ({
        url: image.url,
        alt: image.alt || found.title,
        // WhatsApp will not fetch an image it has no dimensions for on the
        // first tap, and shows the grey box instead.
        width: 1200,
        height: 1200,
      })),
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function PiecePage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang: raw, slug } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const initial = await piece(lang, slug);

  return (
    <>
      {/*
        The same facts again, for a machine. This is what puts a price and an
        in-stock mark under the result in Google rather than a bare blue link,
        and it is written from the same fetch, so it cannot drift from what the
        page says.
      */}
      {initial ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(productSchema(initial, lang)) }}
        />
      ) : null}
      <PieceView lang={lang} slug={slug} initial={initial} />
    </>
  );
}

function productSchema(found: PieceDetail, lang: Lang) {
  const inStock = found.kind === "workshop" || (found.available ?? 0) > 0;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: found.title,
    description: found.description || undefined,
    image: found.images.map((image) => image.url),
    sku: found.slug,
    brand: { "@type": "Brand", name: "MoStyle" },
    offers: {
      "@type": "Offer",
      url: `${siteUrl}/${lang}/piece/${found.slug}`,
      price: found.price,
      priceCurrency: "MAD",
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      // Cash on delivery, stated where a machine can read it too.
      acceptedPaymentMethod: "http://purl.org/goodrelations/v1#COD",
    },
  };
}
