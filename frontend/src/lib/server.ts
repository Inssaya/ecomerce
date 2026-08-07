/**
 * Reading the API from the server, for the things a crawler has to see.
 *
 * `lib/api.ts` talks to `/api`, which only resolves in a browser — it goes
 * through the rewrite in `next.config.ts`. Anything rendered on the server
 * (metadata, the sitemap, the first paint of the landing page) has to reach
 * the API directly, so it lives here rather than being written out a third
 * time at each call site.
 *
 * Nothing here throws. A page that fails to render because a counter or a
 * share image was unavailable is worse than the page without it.
 */
import type { Lang } from "./i18n";

/**
 * Where the browser thinks the site is.
 *
 * Metadata has to be absolute — a relative og:image is not fetched by WhatsApp
 * or by Google — so every canonical link, hreflang pair, sitemap entry and
 * share card in the site is built from this one value.
 *
 * Which makes it the single most consequential environment variable here: set
 * it wrong and the site politely tells Google that the real version of every
 * page lives on a domain you do not own. Set at **build** time, because most
 * of these pages are prerendered.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

/**
 * The canonical URL and the language alternates for one page.
 *
 * Written once because it was written eight times, and all eight were missing
 * the same thing: `x-default`. Without it a search engine that cannot match
 * the reader's language — most of the world arriving at a bilingual Moroccan
 * site — has no instruction about which version to show, and picks. With it,
 * the pair is a complete set: English, Arabic, and what to do otherwise.
 *
 * The paths are relative; Next makes them absolute against `metadataBase`.
 *
 * @param path the route below the language, e.g. `/store` or `/piece/x`.
 *             Empty for the landing page.
 */
export function alternates(lang: Lang, path = "") {
  return {
    canonical: `/${lang}${path}`,
    languages: {
      en: `/en${path}`,
      ar: `/ar${path}`,
      // English is the default landing — `/` already redirects there.
      "x-default": `/en${path}`,
    },
  };
}

/**
 * The workshop's phone, in international form, or nothing.
 *
 * Local search leans on a business having a consistent name, address and phone
 * wherever it appears — the same number on the site, in the structured data and
 * on a Google Business Profile. This is the site's half of that. It is the
 * WhatsApp number because in this market that *is* the business number.
 *
 * Absent rather than invented when unset: a wrong phone number in structured
 * data is worse than none, because it is the one a search result will show.
 */
export const workshopPhone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  ? `+${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER.replace(/\D/g, "")}`
  : null;

function apiBase(): string {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://api:8000";
}

/**
 * @param revalidate seconds to cache for. Catalogue pages are shared by every
 * visitor and every crawler, so a minute of staleness costs nothing and saves
 * the API from being hit once per share preview.
 */
export async function fromApi<T>(
  path: string,
  lang: Lang,
  { revalidate = 60 }: { revalidate?: number } = {},
): Promise<T | null> {
  const separator = path.includes("?") ? "&" : "?";
  try {
    const response = await fetch(`${apiBase()}/api${path}${separator}lang=${lang}`, {
      headers: { "accept-language": lang },
      next: { revalidate },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
