import type { Metadata } from "next";
import Link from "next/link";

import { PieceCard } from "@/components/PieceCard";
import type { Piece } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { fromApi } from "@/lib/server";

/**
 * Search results, on their own route.
 *
 * It began as a branch inside the store feed, reading `?q=` in the browser.
 * That was wrong twice over: the bar navigates from `/store` to `/store?q=…`,
 * which is the same route, so the feed never remounted and the query was
 * ignored; and reading it with `useSearchParams` pushed the entire shelf into
 * the client, so the store page served an empty document to a crawler.
 *
 * A separate route fixes both. The query is a real route parameter, read on
 * the server, and the results are in the HTML — which matters, because the
 * site's structured data promises Google this exact page.
 *
 * `noindex` all the same: a results page is for a person mid-search, not a
 * page anyone should land on cold from a search engine.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { lang: raw } = await params;
  const { q } = await searchParams;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  return {
    title: q ? `${q} — MoStyle` : `${t("search")} — MoStyle`,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { lang: raw } = await params;
  const { q } = await searchParams;
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);
  const ar = lang === "ar";
  const term = (q ?? "").trim();

  const found = term
    ? await fromApi<{ items: Piece[] }>(
        `/products?q=${encodeURIComponent(term)}&size=60`,
        lang,
        { revalidate: 0 },
      )
    : null;
  const pieces = found?.items ?? [];

  return (
    <div className="page-wide pt-8 pb-16">
      <h1 className="text-[clamp(26px,3vw,38px)] leading-[1.05] font-semibold tracking-[-0.035em]">
        {term ? `“${term}”` : t("search")}
      </h1>

      {term === "" ? (
        <p className="mt-3 text-[15.5px] text-ink-soft">
          {ar ? "اكتب ما تبحث عنه في الشريط أعلاه." : "Type what you are looking for in the bar above."}
        </p>
      ) : pieces.length === 0 ? (
        // Not a dead end: the one thing this shop can say that a reseller
        // cannot is that we will make it.
        <div className="max-w-[44ch] py-[clamp(40px,6vw,80px)]">
          <h2 className="text-[clamp(22px,2.6vw,32px)] leading-[1.1] font-semibold tracking-[-0.03em]">
            {t("searchNothing")}
          </h2>
          <p className="mt-3 text-[15.5px] leading-[1.6] text-ink-soft">
            {ar
              ? "أخبرنا بما دار في ذهنك، ونحدّد ثمنه ونصنعه."
              : "Tell us what you had in mind and we'll price it and make it."}
          </p>
          <Link href={`/${lang}/ask`} className="btn-primary mt-5">
            {t("askUs")}
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2.5 text-[14px] text-ink-soft">
            {t("searchFound", { n: pieces.length })}
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 md:gap-5">
            {pieces.map((piece, index) => (
              <PieceCard key={piece.id} piece={piece} lang={lang} priority={index < 4} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
