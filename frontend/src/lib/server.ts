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
// `||` rather than `??` on purpose. A Docker `ARG` with no default becomes an
// empty string, not undefined, so `??` kept it — and "" is not a URL. Every
// page under the language layout builds `metadataBase: new URL(siteUrl)`, so
// one empty variable threw in all 27 of them, reported as an opaque digest on
// whichever page a worker reached first.
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
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
 * Structured data, safe to put inside a `<script>` tag.
 *
 * `JSON.stringify` escapes quotes and backslashes and nothing else — in
 * particular it leaves `<` alone. So a product title containing
 * `</script><img src=x onerror=…>` closes the tag and everything after it is
 * markup, on every page that piece appears on.
 *
 * Reaching it needs the owner's account, since titles and descriptions are
 * written in the panel, so this is not a hole a stranger can walk through. It
 * is worth closing anyway: the fix is three replacements, the alternative is
 * that one careless paste from a supplier's site permanently defaces the shop,
 * and the person who would have to notice is the same person who pasted it.
 *
 * U+2028 and U+2029 are escaped for a related reason: they end a line in
 * JavaScript but not in JSON, so an unescaped one is a syntax error.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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

function url(path: string, lang: Lang): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${apiBase()}/api${path}${separator}lang=${lang}`;
}

/**
 * Something a page is *enriched* by, where nothing is worth failing over.
 *
 * The landing page's counts, the store's first shelf, the sitemap's extra
 * batches: if the API blinks, the page is still worth serving without them.
 * Every failure collapses to null here on purpose.
 *
 * @param revalidate seconds to cache for. Catalogue pages are shared by every
 * visitor and every crawler, so a minute of staleness costs nothing and saves
 * the API from being hit once per share preview.
 */
export async function fromApi<T>(
  path: string,
  lang: Lang,
  { revalidate = 60 }: { revalidate?: number } = {},
): Promise<T | null> {
  try {
    const response = await fetch(url(path, lang), {
      headers: { "accept-language": lang },
      next: { revalidate },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Something a page *is*.
 *
 * A piece, a city, a service — where the page has no meaning without it, and
 * the honest answer to "there is no such thing" is 404 rather than a page
 * saying "not found" with a 200 beside it. Google reads the status, not the
 * sentence: a soft 404 keeps a dead product indexed and competing with the
 * live ones.
 *
 * Which is why this cannot be `fromApi`. That one turns *every* failure into
 * null, and a null from an API that is merely unreachable would become a 404
 * for a piece that is perfectly fine — cached, by revalidation, over a page
 * that sells something. So:
 *
 * - **null** — the shop answered and said there is no such thing. 404 it.
 * - **throws** — we could not ask. Next renders the error page, the visitor is
 *   told to come back, and no crawler is told anything was deleted.
 *
 * One honest limitation, measured rather than assumed. A page that `await`s
 * before calling `notFound()` has already begun streaming, so the status line
 * has gone out as 200 — a bare `notFound()` page in this same app returns a
 * real 404, and the piece page returns 200 with the not-found body. What keeps
 * a dead piece out of the index is therefore the `noindex` Next renders with
 * that body, which is why the language layout no longer overrides it with an
 * `index, follow` of its own. Getting the status right as well would mean
 * looking the slug up in middleware, on every request, to answer a question the
 * page is about to ask anyway.
 */
export async function resource<T>(
  path: string,
  lang: Lang,
  { revalidate = 60 }: { revalidate?: number } = {},
): Promise<T | null> {
  const response = await fetch(url(path, lang), {
    headers: { "accept-language": lang },
    next: { revalidate },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The shop answered ${response.status} for ${path}`);
  return (await response.json()) as T;
}
