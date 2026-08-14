"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api, type CategoryNode } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

/**
 * The lines of work, as a column of marks down the side of the shop.
 *
 * Desktop only — a phone has no room for a rail beside the wall, and this
 * component is simply not mounted below `lg`. It is not a sidebar: there is no
 * panel behind it, no background, no border. Each mark floats on the page
 * itself, and only the icon costs any width — the name only appears in a
 * tooltip on hover, which is the entire point of drawing it this way rather
 * than as a list of labelled rows.
 *
 * `position: fixed` is what keeps it in place while the wall scrolls under it,
 * and `start-*` rather than `left-*` is deliberate: it sits on the left of an
 * English page and mirrors to the right in Arabic, with everything else that
 * uses logical properties, instead of stranding itself on the wrong side of a
 * right-to-left page.
 *
 * It reads and writes the same `?category=` the smart filter does — picking a
 * mark here and picking the same line from the filter popover are the same
 * action, just reached two different ways.
 */
export function CategoryRail({ lang }: { lang: Lang }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const active = params.get("category") ?? "";

  const [roots, setRoots] = useState<CategoryNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .categories(lang)
      .then((tree) => !cancelled && setRoots(tree))
      .catch(() => !cancelled && setRoots([]));
    return () => {
      cancelled = true;
    };
  }, [lang]);

  if (!roots || roots.length === 0) return null;

  function pick(slug: string) {
    const next = new URLSearchParams(params.toString());
    if (slug && slug !== active) next.set("category", slug);
    else next.delete("category");
    const query = next.toString();
    router.replace(query ? `${path}?${query}` : path, { scroll: false });
  }

  return (
    <nav
      aria-label="Categories"
      className="hidden lg:flex fixed start-6 top-1/2 -translate-y-1/2 z-20
                 flex-col items-center gap-1.5"
    >
      {roots.map((root) => (
        <RailIcon
          key={root.slug}
          root={root}
          on={active === root.slug}
          onClick={() => pick(root.slug)}
        />
      ))}
    </nav>
  );
}

function RailIcon({
  root,
  on,
  onClick,
}: {
  root: CategoryNode;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        aria-label={root.name}
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-200 ${
          on ? "bg-ink text-white" : "text-ink-soft hover:bg-clay-soft hover:text-ink"
        }`}
      >
        {root.icon_url ? (
          // The mark is an uploaded image, so a text colour cannot touch it —
          // `brightness-0` flattens whatever was uploaded to black and
          // `invert` lifts it to white once the line is the active one.
          <span className="relative block h-6 w-6 overflow-hidden">
            <Image
              src={root.icon_url}
              alt=""
              fill
              sizes="24px"
              className={`object-contain ${on ? "brightness-0 invert" : "opacity-80"}`}
            />
          </span>
        ) : (
          // No icon set yet: the initial, so the mark is never a blank circle.
          <span className="text-[13px] font-semibold">{root.name.charAt(0)}</span>
        )}
      </button>

      {/* The tooltip. Only ever shown one at a time, on the item under the
          cursor — it is not a panel, so it costs nothing when nobody is
          pointing at the rail. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute start-full top-1/2 -translate-y-1/2 ms-2.5
                   whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-[12.5px] font-medium text-white
                   opacity-0 -translate-x-1 transition-all duration-150
                   group-hover:opacity-100 group-hover:translate-x-0"
      >
        {root.name}
      </span>
    </div>
  );
}
