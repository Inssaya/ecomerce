import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/server";

import { LANGS } from "@/lib/i18n";

/**
 * What a crawler may read.
 *
 * Everything a buyer can see, and nothing else. Three kinds of page are kept
 * out, for three different reasons:
 *
 * - **Someone's own** — a cart, a tracking link, a custom request. Not secret,
 *   but theirs, and they would be indexed with a name and a city in them.
 * - **The owner's** — `/workshop` is the control room. It is behind a sign-in,
 *   so this is not what protects it; it is here so it never appears in a
 *   search result at all.
 * - **The workbench** — `/ambient` exists to judge backgrounds against real
 *   cards. It is not a page anyone should arrive on from Google.
 *
 * `Disallow` is a request, not a wall. Everything above that actually needs
 * protecting is authenticated or holds an unguessable token; this only keeps
 * them out of an index.
 */
const PRIVATE = ["/cart", "/checkout", "/track/", "/request/", "/workshop", "/ambient"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        ...LANGS.flatMap((lang) => PRIVATE.map((path) => `/${lang}${path}`)),
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
