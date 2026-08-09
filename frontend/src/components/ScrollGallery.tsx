"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import type { Piece } from "@/lib/api";
import { type Lang, money } from "@/lib/i18n";

/**
 * The shelf, moving.
 *
 * The landing page was a wall of type: nothing on it moved, and the one thing
 * this shop has that a reseller does not — a photograph of the actual object —
 * was not on it at all. This puts the pieces on the page and lets the scroll
 * animate them.
 *
 * Driven from the scroll position rather than from a timer, so the motion is
 * the reader's: they control the speed and the direction, and it stops when
 * they stop. Each tile is given a lane — odd tiles rise and drift one way,
 * even tiles the other — so the grid breathes instead of sliding as one slab.
 *
 * Everything is a `transform` and an `opacity`, the only two properties a
 * browser animates without laying the page out again. Written on each frame
 * inside `requestAnimationFrame`, and only while the section is on screen:
 * scrolling the rest of the site costs nothing.
 */
export function ScrollGallery({ lang, pieces }: { lang: Lang; pieces: Piece[] }) {
  const root = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = root.current;
    if (!list) return;

    // Someone who has asked their system for less motion gets none. The pieces
    // are still there, still in the grid, simply still.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (still.matches) return;

    const tiles = Array.from(list.querySelectorAll<HTMLElement>("[data-tile]"));
    let frame = 0;
    let visible = false;

    const draw = () => {
      frame = 0;
      const height = window.innerHeight;
      for (const tile of tiles) {
        const box = tile.getBoundingClientRect();
        // -1 when the tile is entering from the bottom, 0 dead centre,
        // +1 leaving past the top. Every number below is a multiple of this.
        const progress = (box.top + box.height / 2 - height / 2) / height;
        const clamped = Math.max(-1.2, Math.min(1.2, progress));
        const lane = Number(tile.dataset.lane);

        const lift = clamped * 34 * lane;
        const drift = clamped * 16 * lane;
        const tilt = clamped * 1.6 * lane;
        // Fades only on the way in, never on the way out — a piece dimming as
        // it leaves reads as broken rather than as depth.
        const fade = Math.min(1, Math.max(0.35, 1 - Math.max(0, progress) * 0.15));

        tile.style.transform = `translate3d(${drift}px, ${lift}px, 0) rotate(${tilt}deg)`;
        tile.style.opacity = String(fade);
      }
    };

    const onScroll = () => {
      if (!visible || frame) return;
      frame = requestAnimationFrame(draw);
    };

    // Only listen while the gallery is actually on screen.
    const watcher = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) onScroll();
      },
      { rootMargin: "200px" },
    );
    watcher.observe(list);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    draw();

    return () => {
      watcher.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pieces.length]);

  if (pieces.length === 0) return null;

  return (
    <ul
      ref={root}
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
      style={{ perspective: "1000px" }}
    >
      {pieces.map((piece, index) => (
        <li
          key={piece.id}
          data-tile
          // Alternating lanes, and the middle column of a three-up runs
          // counter to both so the row never moves as one piece.
          data-lane={index % 2 === 0 ? 1 : -1}
          className="will-change-transform"
          style={{ transition: "opacity 300ms ease-out" }}
        >
          <Link href={`/${lang}/piece/${piece.slug}`} className="group block">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-surface">
              {piece.image ? (
                <Image
                  src={piece.image}
                  alt={piece.title}
                  fill
                  sizes="(max-width: 768px) 50vw, (max-width: 1180px) 33vw, 280px"
                  className="object-cover transition-transform duration-700 ease-out
                             group-hover:scale-[1.06]"
                  priority={index < 4}
                />
              ) : null}
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <p className="text-[14px] font-medium truncate">{piece.title}</p>
              <p className="stamp text-[13px] text-ink-soft shrink-0">
                {money(piece.price, lang)}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
