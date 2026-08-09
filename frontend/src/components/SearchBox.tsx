"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { type Lang, translator } from "@/lib/i18n";

/**
 * The search field in the header.
 *
 * Split out of `Chrome` because it is the one piece of chrome that needs
 * `useSearchParams()` — and that hook forces whatever renders it into
 * client-side rendering unless something above it suspends. `Chrome` wraps
 * every page, including ones that are otherwise fully static (`/ask`,
 * `/how-we-work`…), so putting the hook there directly took every one of
 * them down with it at build time. Here, the fallback while that resolves is
 * just the same input with nothing wired up yet — nobody can tell the
 * difference for the one frame it takes.
 */
export function SearchBox({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const path = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");

  // On the shop itself the box mirrors whatever `?q=` currently is — typed
  // here, cleared from the filter popover's "×", or simply reloaded.
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const shopping = path === `/${lang}`;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (shopping) {
      // Narrow the same page in place, combined with whatever category is
      // active, rather than leaving for a second page that knows nothing
      // about that filter.
      const next = new URLSearchParams(searchParams.toString());
      if (term) next.set("q", term);
      else next.delete("q");
      const search = next.toString();
      router.replace(search ? `${path}?${search}` : path, { scroll: false });
      return;
    }
    router.push(term ? `/${lang}/search?q=${encodeURIComponent(term)}` : `/${lang}`);
  }

  return (
    <form onSubmit={submit} className="relative min-w-0 w-[130px] sm:w-[210px]">
      <SearchIcon className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-mute" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        type="search"
        inputMode="search"
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        className="w-full h-10 rounded-full bg-surface border border-sand ps-9 pe-3.5
                   text-[14.5px] text-ink placeholder:text-ink-mute
                   focus:border-clay focus:outline-none transition-colors duration-200"
      />
    </form>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
