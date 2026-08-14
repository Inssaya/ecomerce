"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import type { Piece } from "@/lib/api";
import { type Lang, money } from "@/lib/i18n";

/**
 * The shelf, as a wall of photographs.
 *
 * A uniform grid crops every piece to the same rectangle, which is exactly
 * wrong for a workshop: a tall lamp and a wide board are different objects and
 * the shape of each one is information. Here every photograph keeps its own
 * height and the columns fill unevenly, the way a pinboard does.
 *
 * Built on CSS `columns` rather than a JavaScript layout pass. There is no
 * measuring, no reflow on resize, nothing to recompute when a card's image
 * loads late — the browser does the packing, and it does it before first paint.
 * The one cost is reading order (down a column, not across a row), which is why
 * the heights are assigned deterministically from the piece id rather than at
 * random: the same piece is always the same shape, so the wall does not
 * reshuffle when the page revalidates.
 *
 * Each tile fades and lifts as it enters, once, driven by IntersectionObserver.
 */
export function Masonry({ lang, pieces }: { lang: Lang; pieces: Piece[] }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wall = root.current;
    if (!wall) return;

    const tiles = Array.from(wall.querySelectorAll<HTMLElement>("[data-tile]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const tile of tiles) tile.style.opacity = "1";
      return;
    }

    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const tile = entry.target as HTMLElement;
          // Stagger by position within the visible batch, not by index in the
          // whole list — otherwise the hundredth card waits three seconds.
          tile.style.transitionDelay = `${Math.min(entries.indexOf(entry), 6) * 60}ms`;
          tile.style.opacity = "1";
          tile.style.transform = "none";
          watcher.unobserve(tile);
        }
      },
      { rootMargin: "80px" },
    );

    for (const tile of tiles) watcher.observe(tile);
    return () => watcher.disconnect();
  }, [pieces.length]);

  if (pieces.length === 0) return null;

  return (
    <div
      ref={root}
      className="[column-fill:_balance] columns-2 md:columns-3 lg:columns-4 xl:columns-5
                 gap-3 md:gap-4"
    >
      {pieces.map((piece) => (
        <article
          key={piece.id}
          data-tile
          className="mb-3 md:mb-4 break-inside-avoid"
          style={{
            opacity: 0,
            transform: "translateY(18px)",
            transition: "opacity 600ms ease-out, transform 600ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          <Link href={`/${lang}/piece/${piece.slug}`} className="group block">
            <div
              className="relative overflow-hidden rounded-2xl bg-surface"
              style={{ aspectRatio: shapeOf(piece.id) }}
            >
              {piece.image ? (
                <Image
                  src={piece.image}
                  alt={piece.title}
                  fill
                  sizes="(max-width:768px) 50vw, (max-width:1024px) 33vw, (max-width:1280px) 25vw, 20vw"
                  className="object-cover transition-transform duration-700 ease-out
                             group-hover:scale-[1.05]"
                />
              ) : null}

              {/* The name and the price ride on the photograph, revealed on
                  hover — a pinboard is images first, captions second. On a
                  phone there is no hover, so the caption below is the one that
                  does the work. */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 p-3
                           opacity-0 translate-y-2 transition-all duration-300 ease-out
                           group-hover:opacity-100 group-hover:translate-y-0
                           hidden md:block"
                style={{
                  background:
                    "linear-gradient(to top, rgba(18,17,19,.78), rgba(18,17,19,0))",
                }}
              >
                <p className="text-white text-[14px] font-medium leading-tight">{piece.title}</p>
                <p className="stamp text-white/80 text-[13px] mt-0.5">
                  {money(piece.price, lang)}
                </p>
              </div>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2 md:hidden">
              <p className="text-[13.5px] font-medium truncate">{piece.title}</p>
              <p className="stamp text-[12.5px] text-ink-soft shrink-0">
                {money(piece.price, lang)}
              </p>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}

/**
 * A stable shape per piece.
 *
 * Derived from the id so it never changes between renders or between the
 * server and the browser — `Math.random()` here would rebuild the wall on
 * every revalidation and mismatch on hydration.
 */
function shapeOf(id: string): string {
  const shapes = ["3 / 4", "1 / 1", "4 / 5", "3 / 4", "2 / 3", "1 / 1"];
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) sum = (sum + id.charCodeAt(index)) % 997;
  return shapes[sum % shapes.length];
}
