"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import type { Piece } from "@/lib/api";
import { type Lang, money, translator } from "@/lib/i18n";
import { track } from "@/lib/signals";

/**
 * One piece in a list.
 *
 * It reports its own impression when it actually enters the screen, not when
 * it is rendered — a card below the fold that nobody scrolled to was not seen,
 * and counting it would teach the feed something false.
 */
export function PieceCard({ piece, lang, priority }: { piece: Piece; lang: Lang; priority?: boolean }) {
  const t = translator(lang);
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          track({ type: "impression", product_id: piece.id });
          observer.disconnect();
        }
      },
      // Half the card, for a moment — a flick past the screen is not a look.
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [piece.id]);

  const soldOut = piece.kind === "shelf" && piece.available === 0;

  return (
    <Link
      ref={ref}
      href={`/${lang}/piece/${piece.slug}`}
      onClick={() => track({ type: "click", product_id: piece.id })}
      className="card block shadow-soft active:scale-[0.99] transition-transform duration-gentle"
    >
      <div className="relative aspect-square bg-clay-soft">
        {piece.image ? (
          <Image
            src={piece.image}
            alt={piece.title}
            fill
            sizes="(max-width: 560px) 50vw, 260px"
            className={`object-cover transition-opacity duration-500 ${soldOut ? "opacity-45" : ""}`}
            priority={priority}
          />
        ) : null}
        {piece.kind === "workshop" ? (
          <span className="absolute top-2 start-2 rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            {t("theWorkshop")}
          </span>
        ) : null}
      </div>

      <div className="p-3.5">
        <h3 className="text-[15px] font-medium leading-snug line-clamp-2">{piece.title}</h3>
        <p className="stamp mt-1.5 text-[15px] font-semibold">
          {money(piece.price, lang)}
          {piece.price_max ? ` – ${money(piece.price_max, lang)}` : ""}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-soft">
          {piece.kind === "workshop"
            ? t("readyInDays", { n: piece.lead_time_days ?? 0 })
            : soldOut
              ? t("allGone")
              : piece.available === 1
                ? t("lastOne")
                : null}
        </p>
      </div>
    </Link>
  );
}
