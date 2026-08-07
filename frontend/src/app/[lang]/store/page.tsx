import type { Metadata } from "next";

import Link from "next/link";

import type { CategoryNode, Piece } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, siteUrl } from "@/lib/server";

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
    alternates: alternates(lang, "/store"),
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
  const [initial, categories] = await Promise.all([
    shelf(lang),
    fromApi<CategoryNode[]>("/categories", lang, { revalidate: 3600 }),
  ]);

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
          dangerouslySetInnerHTML={{ __html: jsonLd(shelfSchema(initial, lang)) }}
        />
      ) : null}
      {/* The lines of work, as real links, above the personalised feed.
          A visitor who came in looking for "hooks" can go straight to the
          hooks page — and each of those pages is what a search naming a line
          lands on, which is the whole reason to have them. */}
      {(categories ?? []).length > 0 ? (
        <nav
          aria-label={lang === "ar" ? "الأقسام" : "Categories"}
          className="page pt-6 flex gap-2 overflow-x-auto"
        >
          {(categories ?? []).map((node) => (
            <Link
              key={node.slug}
              href={`/${lang}/store/${node.slug}`}
              className="shrink-0 rounded-2xl bg-clay-soft px-4 py-1.5 text-[13px] font-medium text-ink"
            >
              {node.name}
            </Link>
          ))}
        </nav>
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
