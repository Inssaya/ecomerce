import Image from "next/image";
import Link from "next/link";

import type { Piece } from "@/lib/api";
import { type Lang } from "@/lib/i18n";

/**
 * The lines of work, as pictures.
 *
 * The count and the photograph are both read from the shelf rather than
 * written here: a line shows the piece most recently made in it, and says how
 * many there are. A tile that claimed "12 products" over a category that had
 * emptied would be the same lie as a batch number that never moves.
 *
 * Server-rendered — this is the first thing under the hero and the thing a
 * crawler follows into each line.
 */
export function CategoryTiles({
  lang,
  lines,
}: {
  lang: Lang;
  lines: { slug: string; name: string; count: number; piece: Piece | undefined }[];
}) {
  if (lines.length === 0) return null;
  const ar = lang === "ar";

  return (
    <div
      className="grid gap-[clamp(10px,1.2vw,16px)]"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))" }}
    >
      {lines.map((line) => (
        <Link
          key={line.slug}
          href={`/${lang}?category=${line.slug}`}
          className="group block rounded-[14px] overflow-hidden bg-surface border border-sand
                     transition-all duration-300 hover:-translate-y-1
                     hover:shadow-[0_14px_30px_-18px_rgba(23,22,24,.4)]"
        >
          <span className="block aspect-[4/3] overflow-hidden bg-sand relative">
            {line.piece?.image ? (
              <Image
                src={line.piece.image}
                alt=""
                fill
                sizes="(max-width: 768px) 50vw, 260px"
                className="object-cover transition-transform duration-500 ease-out
                           group-hover:scale-[1.05]"
              />
            ) : null}
          </span>
          <span className="flex items-center justify-between px-[15px] py-[13px]">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{line.name}</span>
            <span className="text-[13px] text-ink-mute">
              {line.count} {ar ? "قطعة" : line.count === 1 ? "piece" : "pieces"}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
