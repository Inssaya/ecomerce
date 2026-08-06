"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";

import { PieceCard } from "@/components/PieceCard";
import { api, type Piece } from "@/lib/api";
import { type Lang, isLang, translator } from "@/lib/i18n";
import { track } from "@/lib/signals";

/**
 * The store. One feed, no filters, no sidebar.
 *
 * Scrolling is not pagination through a fixed list — each page is re-scored
 * against everything the visitor has done since the last one, so the store
 * narrows around them as they go. That is why this is a client component: the
 * feed is per-visitor and cannot be cached or rendered ahead of time.
 */
export default function Store({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = use(params);
  const lang = (isLang(raw) ? raw : "en") as Lang;
  const t = translator(lang);

  const [pieces, setPieces] = useState<Piece[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading.current || !more) return;
    loading.current = true;
    try {
      const next = page + 1;
      const result = await api.feed(lang, next);
      // The feed can legitimately return a piece already shown — it re-scores
      // every request — so identity is enforced here rather than assumed.
      setPieces((current) => {
        const seen = new Set(current.map((piece) => piece.id));
        return [...current, ...result.items.filter((piece) => !seen.has(piece.id))];
      });
      setPage(next);
      setMore(result.has_more);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }, [lang, more, page]);

  useEffect(() => {
    void loadMore();
    // Deliberately once, on mount: loadMore closes over the page it advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          track({ type: "scroll_depth", value: 70 });
          void loadMore();
        }
      },
      // Start fetching before the visitor reaches the bottom, so the next
      // pieces are there by the time they arrive.
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="page pt-6">
      <h1 className="text-[26px] font-semibold tracking-tight">{t("theShelf")}</h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">{t("shelfMeaning")}</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {pieces.map((piece, index) => (
          <PieceCard key={piece.id} piece={piece} lang={lang} priority={index < 4} />
        ))}
      </div>

      {pieces.length === 0 && !failed ? (
        <div className="mt-6 grid grid-cols-2 gap-3" aria-hidden>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="card aspect-[3/4] bg-clay-soft/60 animate-pulse" />
          ))}
        </div>
      ) : null}

      {failed ? (
        <div className="mt-10 text-center">
          <p className="text-[15px] text-ink-soft">{t("somethingWentWrong")}</p>
          <button type="button" onClick={() => void loadMore()} className="btn-quiet mt-4">
            {t("tryAgain")}
          </button>
        </div>
      ) : null}

      <div ref={sentinel} className="h-10" />

      {!more && pieces.length > 0 ? (
        <p className="pb-6 text-center text-[14px] text-ink-soft">{t("ifWeDontHaveIt")}</p>
      ) : null}
    </div>
  );
}
