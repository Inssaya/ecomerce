"use client";

import Link from "next/link";
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
 *
 * One field sits above it, because someone who arrives knowing what they want
 * will not scroll to find it — they will leave. It replaces the feed while
 * there is something typed in it and gets out of the way when there is not,
 * which is the only filter this shop needs at its size.
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

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Piece[] | null>(null);
  const searching = query.trim().length > 0;

  useEffect(() => {
    const typed = query.trim();
    if (typed.length === 0) {
      setResults(null);
      return;
    }
    let cancelled = false;
    // Long enough that a search fires once per word rather than once per
    // letter, short enough that it never feels like waiting.
    const timer = setTimeout(async () => {
      try {
        const found = await api.search(lang, typed);
        if (cancelled) return;
        setResults(found.items);
        // The heaviest signal there is (weight 4) — someone typing a word is
        // telling the workshop what to make far more plainly than a click.
        track({ type: "search", query: typed });
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lang, query]);

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

  if (searching) {
    return (
      <div className="page pt-6">
        <h1 className="text-[26px] font-semibold tracking-tight">{t("theShelf")}</h1>
        <p className="mt-1.5 text-[15px] text-ink-soft">{t("shelfMeaning")}</p>
        <SearchField lang={lang} query={query} onChange={setQuery} />

        {results === null ? (
          <div className="mt-6 grid grid-cols-2 gap-3" aria-hidden>
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="card aspect-[3/4] bg-clay-soft/60 animate-pulse" />
            ))}
          </div>
        ) : results.length === 0 ? (
          // Not a dead end: the one thing this shop can say that a reseller
          // cannot is that we will make it.
          <div className="mt-10 text-center">
            <p className="text-[15px] text-ink-soft">{t("searchNothing")}</p>
            <Link href={`/${lang}/ask`} className="btn-primary inline-flex mt-5">
              {t("askUs")}
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[13px] text-ink-soft">
              {t("searchFound", { n: results.length })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {results.map((piece, index) => (
                <PieceCard key={piece.id} piece={piece} lang={lang} priority={index < 4} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page pt-6">
      <h1 className="text-[26px] font-semibold tracking-tight">{t("theShelf")}</h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">{t("shelfMeaning")}</p>
      <SearchField lang={lang} query={query} onChange={setQuery} />

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

/**
 * One field, no button.
 *
 * A search button is a second tap for something the keyboard already ends,
 * and on a phone it costs a screen of thumb travel. Clearing is one tap
 * because getting back to the feed has to be as easy as leaving it.
 */
function SearchField({
  lang,
  query,
  onChange,
}: {
  lang: Lang;
  query: string;
  onChange: (value: string) => void;
}) {
  const t = translator(lang);
  return (
    <div className="relative mt-5">
      <label className="sr-only" htmlFor="search">
        {t("search")}
      </label>
      <input
        id="search"
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("searchPlaceholder")}
        autoComplete="off"
        // `search` on iOS gives a keyboard whose action key closes it.
        enterKeyHint="search"
        className="field pe-16"
      />
      {query ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute inset-y-0 end-2 px-2 text-[13px] font-medium text-ink-soft"
        >
          {t("searchClear")}
        </button>
      ) : null}
    </div>
  );
}
