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
 * Drawn to the design's shop card: a 4:5 photograph with a 14px radius that
 * scales slowly under the cursor, the status as a small badge over the top
 * corner, and the name, the promise and the price on one baseline underneath.
 * The card itself carries no border, no shadow and no surface — a wall of these
 * should read as a wall of photographs, and a box around each one is what makes
 * a shop look like a spreadsheet.
 *
 * It reports its own impression when it actually enters the screen, not when it
 * is rendered — a card below the fold that nobody scrolled to was not seen, and
 * counting it would teach the feed something false.
 */
export function PieceCard({
  piece,
  lang,
  priority,
}: {
  piece: Piece;
  lang: Lang;
  priority?: boolean;
}) {
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
  const note = piece.kind === "workshop"
    ? t("readyInDays", { n: piece.lead_time_days ?? 0 })
    : soldOut
      ? t("allGone")
      : piece.available === 1
        ? t("lastOne")
        : "";

  return (
    <Link
      ref={ref}
      href={`/${lang}/piece/${piece.slug}`}
      onClick={() => track({ type: "click", product_id: piece.id })}
      className="group block"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] bg-surface">
        {piece.image ? (
          <Image
            src={piece.image}
            alt={piece.title}
            fill
            sizes="(max-width:768px) 50vw, (max-width:1180px) 33vw, 280px"
            className={`object-cover transition-transform duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)]
                        group-hover:scale-[1.06] ${soldOut ? "opacity-45" : ""}`}
            priority={priority}
          />
        ) : null}

        {soldOut ? (
          <span className="absolute top-3 start-3 rounded-full bg-ink/85 px-2.5 py-1.5 text-[12px] font-medium text-white">
            {t("allGone")}
          </span>
        ) : piece.kind === "shelf" && piece.available === 1 ? (
          <span className="absolute top-3 start-3 rounded-full bg-clay px-2.5 py-1.5 text-[12px] font-medium text-white">
            {t("lastOne")}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-mute">
            {piece.kind === "workshop" ? t("madeToOrder") : t("theShelf")}
          </p>
          <h3 className="mt-1 text-[15.5px] font-semibold tracking-[-0.01em] truncate">
            {piece.title}
          </h3>
          {note ? <p className="mt-0.5 text-[13.5px] text-ink-mute truncate">{note}</p> : null}
        </div>
        <p className="stamp text-[15.5px] font-semibold whitespace-nowrap tabular-nums">
          {money(piece.price, lang)}
          {piece.price_max ? ` – ${money(piece.price_max, lang)}` : ""}
        </p>
      </div>
    </Link>
  );
}
