import Image from "next/image";

/**
 * The workshop's mark — the real one, from `public/logo.png`.
 *
 * `priority` because it sits in the header of every page and is part of the
 * first paint; without it Next lazy-loads it and the corner of the bar is
 * empty for a beat on every navigation.
 *
 * A raster logo cannot follow `currentColor` the way a drawn SVG can, so it
 * keeps its own colours on the night theme too. If that ever reads badly,
 * the fix is a light variant swapped on `[data-ambient="night"]`, not a
 * filter over this one.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={64}
      height={64}
      priority
      className={`object-contain ${className}`}
    />
  );
}
