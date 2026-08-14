"use client";

import { useCallback, useState } from "react";

import { PieceCard } from "@/components/PieceCard";
import { api, type Piece } from "@/lib/api";
import { type Lang, translator } from "@/lib/i18n";

/** Matches the shelf's own page size, so a search page never feels slower. */
const PAGE = 30;

/**
 * The results grid, with room to keep going.
 *
 * The server hands over the first batch and whether there is more; this
 * component's whole job is fetching further batches on request. It was a
 * flat list capped at 60 with nothing past it — a query matching more than
 * that silently lost the rest, with no count and no way to reach them.
 */
export function SearchResults({
  lang,
  term,
  initial,
  total,
  hasMore,
}: {
  lang: Lang;
  term: string;
  initial: Piece[];
  total: number;
  hasMore: boolean;
}) {
  const t = translator(lang);
  const [pieces, setPieces] = useState(initial);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !more) return;
    setLoading(true);
    setFailed(false);
    try {
      const next = page + 1;
      const batch = await api.products(lang, { page: next, size: PAGE, q: term });
      setPieces((current) => [...current, ...batch.items]);
      setPage(next);
      setMore(batch.has_more);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [lang, loading, more, page, term]);

  return (
    <>
      <p className="mt-2.5 text-[14px] text-ink-soft">{t("searchFound", { n: total })}</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 md:gap-5">
        {pieces.map((piece, index) => (
          <PieceCard key={piece.id} piece={piece} lang={lang} priority={index < 4} />
        ))}
      </div>

      {more ? (
        <div className="mt-8 flex flex-col items-center gap-2">
          <button type="button" onClick={loadMore} disabled={loading} className="btn-quiet">
            {loading ? t("loading") : lang === "ar" ? "عرض المزيد" : "Show more"}
          </button>
          {failed ? (
            <p role="alert" className="text-[13px] text-warn">
              {lang === "ar" ? "تعذّر تحميل المزيد." : "Couldn't load more just now."}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
