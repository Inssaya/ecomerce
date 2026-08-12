import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Link from "next/link";

import { PieceCard } from "@/components/PieceCard";
import type { Piece, PieceDetail } from "@/lib/api";
import { type Lang, isLang, money, translator } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, resource, siteUrl } from "@/lib/server";

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
  // `resource`, not `fromApi`: a slug with nothing behind it has to be a real
  // 404, and an API we merely could not reach must not be mistaken for one.
  return resource<PieceDetail>(`/products/${slug}`, lang);
}

/** Pull enough neighbours to make the section feel like a shelf, not a teaser. */
const RELATED = 12;

async function related(
  lang: Lang,
  categorySlug: string,
  exceptId: string,
): Promise<Piece[]> {
  const page = await fromApi<{ items: Piece[] }>(
    `/products?category=${encodeURIComponent(categorySlug)}&size=${RELATED}`,
    lang,
    { revalidate: 300 },
  );
  return (page?.items ?? []).filter((item) => item.id !== exceptId).slice(0, 8);
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

  // The one line under the title in search snippets and share previews: the
  // price, and — for a workshop piece — how long it takes to make. No stock
  // claim; the shop does not track units, so a "how many left" sentence here
  // would be one the site cannot back up. A claim we cannot keep is worse
  // than no claim.
  const madeNote =
    found.kind === "workshop" && found.lead_time_days
      ? t("readyInDays", { n: found.lead_time_days })
      : "";

  const description = `${money(found.price, lang)}${madeNote ? ` · ${madeNote}` : ""} ${found.description || t("taglineSupport")}`
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

  // Archived, deleted, or simply mistyped. This page used to answer 200 with
  // the words "not found" on it, which keeps a dead product in the index
  // competing with the live ones and tells a person nothing they can act on.
  if (!initial) notFound();

  // Other pieces from the same line, fetched here on the server so they are on
  // the page for a crawler and a share preview, not painted on afterwards.
  // Skipped entirely when the piece has no category — a page saying "more of
  // this kind" that then shows nothing is worse than not asking.
  const more = initial.category_slug
    ? await related(lang, initial.category_slug, initial.id)
    : [];

  return (
    <>
      {/*
        The same facts again, for a machine. This is what puts a price and an
        in-stock mark under the result in Google rather than a bare blue link,
        and it is written from the same fetch, so it cannot drift from what the
        page says.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(productSchema(initial, lang)) }}
      />
      <PieceView lang={lang} slug={slug} initial={initial} />
      {more.length > 0 && initial.category_slug ? (
        <MorePieces lang={lang} pieces={more} />
      ) : null}
    </>
  );
}

/**
 * A fuller shelf of neighbours, kept on the same page.
 */
function MorePieces({
  lang,
  pieces,
}: {
  lang: Lang;
  pieces: Piece[];
}) {
  const ar = lang === "ar";
  return (
    <section className="shell border-t border-rule pt-10 pb-16">
      {/* A rule and a label. The paragraph that used to sit here explained
          what "more of this kind" meant, which the heading already says. */}
      <h2 className="eyebrow">{ar ? "من النوع نفسه" : "More of this kind"}</h2>
      <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-5 xl:grid-cols-4">
        {pieces.map((piece) => (
          <li key={piece.id}>
            <PieceCard lang={lang} piece={piece} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function productSchema(found: PieceDetail, lang: Lang) {
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
      // Every listed piece is buyable. The shop does not count units, so a
      // stock signal here would be one the site cannot back up.
      availability: "https://schema.org/InStock",
      // Cash on delivery, stated where a machine can read it too.
      acceptedPaymentMethod: "http://purl.org/goodrelations/v1#COD",
    },
  };
}
