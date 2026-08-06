import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/server";

/**
 * What a crawler may read.
 *
 * Everything a buyer can see, nothing that belongs to one person. A cart or a
 * tracking link is not secret, but it is theirs, and it would be indexed with
 * a name and a city in it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/en/cart", "/ar/cart", "/en/checkout", "/ar/checkout", "/en/track/", "/ar/track/", "/en/request/", "/ar/request/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
