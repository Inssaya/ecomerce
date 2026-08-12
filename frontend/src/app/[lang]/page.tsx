import { ProductFeed } from "@/components/ProductFeed";
import type { CategoryNode, Piece } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { alternates, fromApi, jsonLd, siteUrl, workshopPhone } from "@/lib/server";

/**
 * The shop, and the front door.
 *
 * There is one page that lists what the workshop makes and this is it — no
 * separate `/store`, no route per category. Somebody arriving from a search
 * lands on the objects, not on writing about them: no hero, no headline, no
 * buttons, no counters. The photographs start at the top of the page.
 *
 * The order is shuffled per visit, so the shelf does not always open on the
 * same six pieces. The seed is minted here, on the server, and handed to the
 * feed — every later page of this visit is drawn from that same arrangement,
 * which is the only way a shuffled list can be paged without repeating itself.
 */
export const dynamic = "force-dynamic";

/** What the first screen needs; the feed asks for the next thirty itself. */
const FIRST_PAGE = 30;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  return {
    title: `MoStyle — ${t("tagline")}`,
    description: t("taglineSupport"),
    alternates: alternates(lang),
  };
}

export default async function Shop({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { lang: raw } = await params;
  const { category } = await searchParams;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);

  // A new arrangement per visit. Postgres' `md5(id || seed)` turns it into a
  // fixed order, so paging stays consistent from here on.
  const seed = Math.floor(Math.random() * 2_147_483_647);

  const [first, categoryList] = await Promise.all([
    fromApi<{ items: Piece[]; total: number; has_more: boolean }>(
      `/products?page=1&size=${FIRST_PAGE}&seed=${seed}` +
        (category ? `&category=${encodeURIComponent(category)}` : ""),
      lang,
    ),
    fromApi<CategoryNode[]>("/categories", lang, { revalidate: 3600 }),
  ]);

  const pieces = first?.items ?? [];
  // `fromApi` collapses every failure to null on purpose, so an empty array
  // here is ambiguous by itself: it means either "nothing matches" or "the
  // shop could not be reached." Only the second is worth telling a visitor
  // about — the first is a normal, honest state.
  const broken = first === null;

  return (
    <div className="px-2.5 pt-2.5 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(workshopSchema(lang, t)) }}
      />

      {/* The page still needs a name for a screen reader and for search — it
          just is not something anybody has to look at. */}
      <h1 className="sr-only">{`MoStyle — ${t("tagline")}`}</h1>

      <ProductFeed
        lang={lang}
        initial={pieces}
        initialBroken={broken}
        hasMore={first?.has_more ?? false}
        seed={seed}
        categories={categoryList ?? []}
      />
    </div>
  );
}

function workshopSchema(lang: Lang, t: (key: "tagline" | "taglineSupport") => string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MoStyle",
    url: `${siteUrl}/${lang}`,
    description: t("taglineSupport"),
    slogan: t("tagline"),
    ...(workshopPhone ? { telephone: workshopPhone } : {}),
    areaServed: { "@type": "Country", name: "Morocco" },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/${lang}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}
