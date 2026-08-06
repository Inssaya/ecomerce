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

/** Where the browser thinks the site is. Metadata has to be absolute — a
 *  relative og:image is not fetched by WhatsApp or by Google. */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://mostyle.ma"
).replace(/\/$/, "");

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
