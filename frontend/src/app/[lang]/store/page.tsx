import type { Metadata } from "next";

import type { Piece } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { fromApi, siteUrl } from "@/lib/server";

import { StoreFeed } from "./StoreFeed";

/**
 * The shelf, rendered on the server before the personalised feed takes over.
 *
 * The store used to be a client component end to end, which meant the second
 * most important page in the shop was served to Google, to WhatsApp and to
 * anyone on a slow connection as an empty div. The feed genuinely is
 * per-visitor and cannot be cached — but the *first* page of it does not have
 * to be personalised to be worth showing, and an unpersonalised shelf is a far
 * better first paint than a row of grey rectangles.
 */
const FIRST_PAGE = 12;

async function shelf(lang: Lang): Promise<Piece[]> {
  const page = await fromApi<{ items: Piece[] }>(`/products?size=${FIRST_PAGE}`, lang);
  return page?.items ?? [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const title = `${t("theShelf")} — MoStyle`;
  const description = `${t("shelfMeaning")} ${t("ifWeDontHaveIt")}`;

  return {
    title,
    description,
    alternates: {
      canonical: `/${lang}/store`,
      languages: { en: "/en/store", ar: "/ar/store" },
    },
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${lang}/store`,
      title,
      description,
    },
  };
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const initial = await shelf(lang);

  return (
    <>
      {/*
        The shelf as a list a search engine can read: each piece with its
        position, price and whether it is here. This is what turns a link to
        the store into a result with pieces under it rather than one blue line.
      */}
      {initial.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(shelfSchema(initial, lang)) }}
        />
      ) : null}
      <StoreFeed lang={lang} initial={initial} />
    </>
  );
}

function shelfSchema(pieces: Piece[], lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: pieces.map((piece, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        name: piece.title,
        url: `${siteUrl}/${lang}/piece/${piece.slug}`,
        image: piece.image ?? undefined,
        offers: {
          "@type": "Offer",
          price: piece.price,
          priceCurrency: "MAD",
          availability:
            piece.kind === "workshop" || (piece.available ?? 0) > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
        },
      },
    })),
  };
}
