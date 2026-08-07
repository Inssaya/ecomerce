import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PieceCard } from "@/components/PieceCard";
import type { CategoryNode, Piece } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, resource, siteUrl } from "@/lib/server";

/**
 * A line of work, on its own page.
 *
 * The store is one feed and it opens on everything, which is right for a
 * shopper landing there and wrong for a search engine — "handmade hooks in
 * Morocco" pointed a person at a page about the whole shelf, and Google could
 * see nothing on the site that specifically answered them. This is that page,
 * one per line: the category's own name in the title, its pieces on it in the
 * body, its own hreflang pair, its own JSON-LD.
 *
 * Statically rendered per language and per category, refreshed on the hour.
 * Not client-rendered: this exists to be *found*, and a page that streams in
 * after the model reads it is a page the model does not read.
 *
 * `dynamicParams = false` is what makes an unknown slug a real 404, cached
 * with the right status, rather than a page saying "not found" under a 200 —
 * the same reason it is there on `/make` and `/delivery`, and the same soft
 * 404 problem the piece page cannot fix without middleware.
 */
export const dynamicParams = false;
export const revalidate = 3600;

interface Params {
  lang: string;
  category: string;
}

export async function generateStaticParams() {
  const list = await fromApi<CategoryNode[]>("/categories", "en");
  const slugs = (list ?? []).map((node) => node.slug);
  return ["en", "ar"].flatMap((lang) => slugs.map((category) => ({ lang, category })));
}

async function landing(lang: Lang, slug: string) {
  // Both in parallel — the category itself for its name and the 404 signal,
  // and the pieces in it. If the category is gone, we do not care about the
  // list.
  const [category, page] = await Promise.all([
    resource<CategoryNode>(`/categories/${slug}`, lang, { revalidate: 3600 }),
    fromApi<{ items: Piece[] }>(`/products?category=${slug}&size=60`, lang, {
      revalidate: 3600,
    }),
  ]);
  return category ? { category, pieces: page?.items ?? [] } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { lang: raw, category: slug } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);

  const found = await landing(lang, slug);
  if (!found) return { title: t("notFound") };

  // The description is the shelf's promise, in words a person actually types
  // into a search: the kind, that we made it, that it goes to Morocco. It is
  // not a claim — every one of them is true of every piece under it.
  const description =
    lang === "ar"
      ? `${found.category.name} — قِطع صنعناها في الورشة، بأيدينا. توصيل نقداً في كل المغرب.`
      : `${found.category.name} — pieces we made in the workshop, by hand. Cash on delivery, anywhere in Morocco.`;

  return {
    title: `${found.category.name} — MoStyle`,
    description,
    alternates: alternates(lang, `/store/${slug}`),
    openGraph: {
      type: "website",
      siteName: "MoStyle",
      locale: lang === "ar" ? "ar_MA" : "en_US",
      url: `${siteUrl}/${lang}/store/${slug}`,
      title: found.category.name,
      description,
    },
  };
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { lang: raw, category: slug } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const ar = lang === "ar";

  const found = await landing(lang, slug);
  if (!found) notFound();

  const { category, pieces } = found;

  return (
    <div className="page pt-6 pb-14">
      {/* Breadcrumb, and structured data for it. Google will draw this as
          "MoStyle › The Shelf › Hooks" instead of an unstructured URL, which
          is a small thing that changes the click-through rate. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema(category, lang)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema(category, pieces, lang)) }}
      />

      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-soft">
        <Link href={`/${lang}/store`} className="underline underline-offset-4">
          {ar ? "الرف" : "The Shelf"}
        </Link>
        <span aria-hidden> · </span>
        <span>{category.name}</span>
      </nav>

      <h1 className="mt-3 text-[26px] font-semibold tracking-tight">{category.name}</h1>
      <p className="mt-2 text-[15px] text-ink-soft leading-relaxed">
        {pieces.length === 0
          ? ar
            ? "لا شيء على الرف هنا الآن. إن أردت شيئاً بعينه، اطلبه ونصنعه."
            : "Nothing on the shelf here right now. If there's something you want, ask and we'll make it."
          : ar
            ? `${pieces.length} قطعة على الرف. صنعناها هنا، وسنسلّمها نقداً عند بابك.`
            : `${pieces.length} pieces on the shelf. Made here, delivered cash at your door.`}
      </p>

      {pieces.length === 0 ? (
        <div className="mt-8">
          <Link href={`/${lang}/ask`} className="btn-primary">
            {ar ? "أخبرنا بما تحتاج" : "Tell us what you need"}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
          {pieces.map((piece) => (
            <li key={piece.id}>
              <PieceCard lang={lang} piece={piece} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function breadcrumbSchema(category: CategoryNode, lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: lang === "ar" ? "الرف" : "The Shelf",
        item: `${siteUrl}/${lang}/store`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: category.name,
        item: `${siteUrl}/${lang}/store/${category.slug}`,
      },
    ],
  };
}

function collectionSchema(category: CategoryNode, pieces: Piece[], lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    url: `${siteUrl}/${lang}/store/${category.slug}`,
    inLanguage: lang === "ar" ? "ar-MA" : "en",
    hasPart: pieces.map((piece) => ({
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
    })),
  };
}
