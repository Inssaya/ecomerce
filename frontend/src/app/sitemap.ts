import type { MetadataRoute } from "next";

import type { Piece } from "@/lib/api";
import { LANGS } from "@/lib/i18n";
import { fromApi, siteUrl } from "@/lib/server";

/**
 * Every page worth finding, in both languages.
 *
 * Built from the catalogue rather than written by hand, so a piece added this
 * morning is in it. If the API is unreachable the fixed pages still ship — a
 * sitemap missing its products is recoverable, a build that fails is not.
 */
/** The API caps a page at 60, so this walks. A single workshop will not have
 *  many pages of them, and the ceiling is there so a bug upstream cannot turn
 *  building the sitemap into an unbounded loop. */
const PAGE_SIZE = 60;
const MAX_PAGES = 20;

async function catalogue(): Promise<Piece[]> {
  const found: Piece[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await fromApi<{ items: Piece[]; has_more: boolean }>(
      `/products?size=${PAGE_SIZE}&page=${page}`,
      "en",
      { revalidate: 3600 },
    );
    if (!batch) break;
    found.push(...batch.items);
    if (!batch.has_more) break;
  }
  return found;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Public doors only. `/workshop` is the owner's control room and `/ambient`
  // is a workbench — neither is a page a buyer should ever land on from a
  // search result.
  const fixed = ["", "/store", "/ask", "/orders", "/delivery"];
  const entries: MetadataRoute.Sitemap = [];

  for (const lang of LANGS) {
    for (const path of fixed) {
      entries.push({
        url: `${siteUrl}/${lang}${path}`,
        changeFrequency: path === "/store" ? "daily" : "weekly",
        priority: path === "" ? 1 : 0.7,
        alternates: {
          languages: Object.fromEntries(
            LANGS.map((other) => [other, `${siteUrl}/${other}${path}`]),
          ),
        },
      });
    }
  }

  // The local network: what we make, and where we deliver it. These are the
  // pages that answer a search naming a service or a city, so they are the
  // ones most worth having crawled.
  const services = await fromApi<{ items: { slug: string }[] }>("/services", "en", {
    revalidate: 3600,
  });
  const places = await fromApi<{ items: { slug: string }[] }>("/places", "en", {
    revalidate: 3600,
  });

  for (const [prefix, rows, priority] of [
    ["make", services?.items ?? [], 0.8],
    ["delivery", places?.items ?? [], 0.6],
  ] as const) {
    for (const row of rows) {
      for (const lang of LANGS) {
        entries.push({
          url: `${siteUrl}/${lang}/${prefix}/${row.slug}`,
          changeFrequency: "monthly",
          priority,
          alternates: {
            languages: Object.fromEntries(
              LANGS.map((other) => [other, `${siteUrl}/${other}/${prefix}/${row.slug}`]),
            ),
          },
        });
      }
    }
  }

  for (const piece of await catalogue()) {
    for (const lang of LANGS) {
      entries.push({
        url: `${siteUrl}/${lang}/piece/${piece.slug}`,
        changeFrequency: "weekly",
        priority: 0.9,
        alternates: {
          languages: Object.fromEntries(
            LANGS.map((other) => [other, `${siteUrl}/${other}/piece/${piece.slug}`]),
          ),
        },
      });
    }
  }

  return entries;
}
