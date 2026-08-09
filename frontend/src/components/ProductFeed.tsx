"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, type CategoryNode, type Piece } from "@/lib/api";
import { type Lang, money, translator } from "@/lib/i18n";
import { track } from "@/lib/signals";

/** Thirty a time. */
const PAGE = 30;

/**
 * The shop: a wall of photographs and nothing else.
 *
 * No headline, no captions under the tiles, no counters. Somebody arriving from
 * a search should land on the objects themselves — the name and the price are a
 * detail you ask for by pointing at a piece, and everything else about it is on
 * its own page.
 *
 * Three things this has to get right:
 *
 * 1. **Shuffled, but only once.** The order is random per visit and then fixed,
 *    because `ORDER BY random()` on a paged list re-rolls the shelf on every
 *    request — page two would repeat pieces from page one and hide others
 *    forever. The server mints a seed, hashes ids against it, and every page of
 *    this visit is drawn from that same arrangement.
 * 2. **The caption is a pointer, not a label.** On a device with a cursor the
 *    name and price fade in over the photograph on hover. A touch screen has no
 *    hover, so there the caption sits on the image permanently and quietly —
 *    otherwise a phone would never show a price at all.
 * 3. **Filtering never leaves the page.** The filter lives in the header; this
 *    listens for it, rewrites the query string and refetches in place.
 */
export function ProductFeed({
  lang,
  initial,
  initialBroken = false,
  hasMore,
  seed,
  categories,
}: {
  lang: Lang;
  initial: Piece[];
  /** The first fetch failed rather than genuinely finding nothing. */
  initialBroken?: boolean;
  hasMore: boolean;
  seed: number;
  categories: CategoryNode[];
}) {
  const t = translator(lang);
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const active = params.get("category") ?? "";
  const query = params.get("q") ?? "";

  // The active line might be a root or one of its children — either way, the
  // popover needs to know which root to show subcategories underneath.
  const activeRoot = categories.find(
    (root) => root.slug === active || root.children.some((child) => child.slug === active),
  );

  const [pieces, setPieces] = useState(initial);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);
  const [narrowing, setNarrowing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [broken, setBroken] = useState(initialBroken);
  const [retryTick, setRetryTick] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);

  // The header's filter button, which is the only control for this.
  useEffect(() => {
    const toggle = () => setPicking((was) => !was);
    window.addEventListener("mostyle:filter", toggle);
    return () => window.removeEventListener("mostyle:filter", toggle);
  }, []);

  // The server rendered page one for whatever the URL asked for; this owns
  // every state after that. A retry bypasses the skip even on the very first
  // render, which is the only way to recover from a server-side fetch that
  // failed before this component ever mounted.
  const first = useRef(true);
  useEffect(() => {
    if (first.current && retryTick === 0) {
      first.current = false;
      return;
    }
    first.current = false;
    let cancelled = false;
    setNarrowing(true);
    api
      .products(lang, { page: 1, size: PAGE, category: active || undefined, q: query || undefined, seed })
      .then((batch) => {
        if (cancelled) return;
        setPieces(batch.items);
        setPage(1);
        setMore(batch.has_more);
        setBroken(false);
      })
      .catch(() => {
        if (!cancelled) setBroken(true);
      })
      .finally(() => !cancelled && setNarrowing(false));
    return () => {
      cancelled = true;
    };
  }, [active, lang, query, seed, retryTick]);

  const loadMore = useCallback(async () => {
    if (loading || !more) return;
    setLoading(true);
    try {
      const next = page + 1;
      const batch = await api.products(lang, {
        page: next,
        size: PAGE,
        category: active || undefined,
        q: query || undefined,
        seed,
      });
      // Belt and braces on top of the stable seed: a piece published between
      // two requests still shifts the list, and showing it twice looks broken.
      setPieces((current) => {
        const seen = new Set(current.map((piece) => piece.id));
        return [...current, ...batch.items.filter((piece) => !seen.has(piece.id))];
      });
      setPage(next);
      setMore(batch.has_more);
    } catch {
      setMore(false);
    } finally {
      setLoading(false);
    }
  }, [active, lang, loading, more, page, query, seed]);

  useEffect(() => {
    const mark = sentinel.current;
    if (!mark || !more) return;
    // Far ahead of the end, so the next thirty are already in place by the
    // time the last row is reached and the wall never visibly stops.
    const watcher = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && void loadMore(),
      { rootMargin: "1200px" },
    );
    watcher.observe(mark);
    return () => watcher.disconnect();
  }, [loadMore, more]);

  function narrow(slug: string, close = true) {
    const next = new URLSearchParams(params.toString());
    if (slug) next.set("category", slug);
    else next.delete("category");
    const search = next.toString();
    // `replace`, not `push`: narrowing the shelf is not somewhere you should
    // have to press Back through five times to leave.
    router.replace(search ? `${path}?${search}` : path, { scroll: false });
    // Closed on a choice that is actually final. A root with children stays
    // open, because tapping it is only step one — the panel closing under a
    // second tap that was meant to reveal, not confirm, is what left it stuck
    // open before.
    if (close) setPicking(false);
  }

  return (
    <>
      {/*
        The smart filter. One control does both jobs on a phone, since there
        is no rail there to pick a root category from — "All" clears
        everything, the roots are the same lines the rail shows as icons, and
        picking a root reveals its own subcategories right underneath so a
        second tap narrows further without reopening anything.
      */}
      {picking && categories.length > 0 ? (
        <div className="mb-4 animate-fade rounded-2xl border border-sand bg-surface p-3">
          {/*
            The lines themselves, phone only. On a wide screen they are the
            rail down the side of the page, so listing them again here would
            be the same four marks twice; `lg:hidden` is the whole difference
            between the two layouts.
          */}
          <div className="flex flex-wrap gap-2 lg:hidden">
            <FilterChip on={!active} onClick={() => narrow("")}>
              {t("allPieces")}
            </FilterChip>
            {categories.map((root) => (
              <FilterChip
                key={root.slug}
                on={active === root.slug}
                onClick={() => narrow(root.slug, root.children.length === 0)}
              >
                {root.name}
              </FilterChip>
            ))}
          </div>

          {/* What this control is actually for: narrowing inside the open
              line. Never another line's subcategories — only the ones that
              belong to whatever is selected right now. */}
          {activeRoot && activeRoot.children.length > 0 ? (
            <div className="flex flex-wrap gap-2 lg:mt-0 lg:border-0 lg:pt-0
                            mt-2.5 border-t border-sand pt-2.5">
              <FilterChip
                small
                on={active === activeRoot.slug}
                onClick={() => narrow(activeRoot.slug)}
              >
                {lang === "ar" ? `الكل` : `All`}
              </FilterChip>
              {activeRoot.children.map((child) => (
                <FilterChip key={child.slug} small on={active === child.slug} onClick={() => narrow(child.slug)}>
                  {child.name}
                </FilterChip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={`transition-opacity duration-200 ${narrowing ? "opacity-40" : "opacity-100"}`}>
        {pieces.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[15px] text-ink-soft">
              {broken
                ? lang === "ar"
                  ? "تعذّر تحميل المتجر الآن."
                  : "Couldn't load the shop right now."
                : query
                  ? lang === "ar"
                    ? "لا شيء يطابق ذلك."
                    : "Nothing matches that."
                  : active
                    ? lang === "ar"
                      ? "لا شيء في هذا القسم بعد."
                      : "Nothing in this one yet."
                    : lang === "ar"
                      ? "لا شيء على الرف بعد."
                      : "Nothing on the shelf yet."}
            </p>
            {broken ? (
              <button
                type="button"
                onClick={() => setRetryTick((n) => n + 1)}
                className="btn-quiet mt-4"
              >
                {lang === "ar" ? "أعد المحاولة" : "Try again"}
              </button>
            ) : null}
          </div>
        ) : (
          /*
            CSS columns, not a JS layout pass: the browser packs the wall before
            first paint, nothing reflows when an image loads late, and there is
            nothing to recompute on resize. Two columns on the smallest phone up
            to five on a wide desktop.
          */
          <div className="[column-fill:_balance] columns-2 sm:columns-3 lg:columns-4 2xl:columns-5
                          gap-2.5 sm:gap-3 lg:gap-4">
            {pieces.map((piece, index) => (
              <Tile key={piece.id} piece={piece} lang={lang} index={index} />
            ))}
          </div>
        )}
      </div>

      <div ref={sentinel} aria-hidden className="h-px" />

      {loading ? (
        <p className="py-10 text-center text-[13.5px] text-ink-mute" aria-live="polite">
          {t("loading")}
        </p>
      ) : null}
    </>
  );
}

function FilterChip({
  on,
  small,
  onClick,
  children,
}: {
  on: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-full font-medium transition-colors duration-200 ${
        small ? "h-8 px-3.5 text-[13px]" : "h-9 px-4 text-[13.5px]"
      } ${
        on
          ? "bg-ink text-white"
          : "border border-sand bg-surface text-ink-soft hover:text-ink hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Tile({ piece, lang, index }: { piece: Piece; lang: Lang; index: number }) {
  const t = translator(lang);
  const ref = useRef<HTMLAnchorElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        // Counted when it reaches the screen, not when it renders: a tile
        // below the fold nobody scrolled to was not seen.
        track({ type: "impression", product_id: piece.id });
        watcher.disconnect();
      },
      { threshold: 0.3 },
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [piece.id]);

  const soldOut = piece.kind === "shelf" && piece.available === 0;

  return (
    <article className="mb-2.5 sm:mb-3 lg:mb-4 break-inside-avoid">
      <Link
        ref={ref}
        href={`/${lang}/piece/${piece.slug}`}
        onClick={() => track({ type: "click", product_id: piece.id })}
        className="group block relative overflow-hidden rounded-2xl bg-clay-soft"
        style={{
          aspectRatio: shapeOf(piece.id),
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : "translateY(14px)",
          transition: "opacity 650ms ease-out, transform 650ms cubic-bezier(.22,.61,.36,1)",
          transitionDelay: `${(index % 10) * 40}ms`,
        }}
      >
        {piece.image ? (
          <Image
            src={piece.image}
            alt={piece.title}
            fill
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, (max-width:1536px) 25vw, 20vw"
            className={`object-cover transition-transform duration-[900ms] ease-gentle
                        group-hover:scale-[1.05] ${soldOut ? "opacity-55" : ""}`}
            priority={index < 6}
          />
        ) : null}

        {soldOut ? (
          <span className="absolute top-3 start-3 rounded-full bg-ink/85 px-2.5 py-1.5
                           text-[12px] font-medium text-white">
            {t("allGone")}
          </span>
        ) : null}

        {/*
          The name and the price.

          `opacity-100` by default and faded out only where a cursor exists
          (`hover:hover`), so the reveal is a pointer-device behaviour and a
          phone — which can never hover — still shows what a piece costs.
        */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-3.5
                     opacity-100 translate-y-0 transition-all duration-300 ease-out
                     [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:translate-y-2
                     group-hover:opacity-100 group-hover:translate-y-0"
          style={{
            background: "linear-gradient(to top, rgba(18,17,19,.80), rgba(18,17,19,0))",
          }}
        >
          <p className="text-white text-[13px] sm:text-[14px] font-medium leading-tight line-clamp-2">
            {piece.title}
          </p>
          <p className="stamp mt-0.5 text-white/85 text-[12.5px] sm:text-[13px]">
            {money(piece.price, lang)}
          </p>
        </div>
      </Link>
    </article>
  );
}

/**
 * A stable shape per piece.
 *
 * Derived from the id so it never changes between renders or between the server
 * and the browser — `Math.random()` here would rebuild the wall on every
 * revalidation and mismatch on hydration.
 */
function shapeOf(id: string): string {
  const shapes = ["3 / 4", "1 / 1", "4 / 5", "3 / 4", "2 / 3", "1 / 1", "5 / 4"];
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) sum = (sum + id.charCodeAt(index)) % 997;
  return shapes[sum % shapes.length];
}
