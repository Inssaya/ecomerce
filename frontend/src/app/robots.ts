import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mostyle.ma";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/store/", "/products/", "/search"],
        disallow: [
          "/account",
          "/checkout",
          "/auth/",
          "/seller/",
          "/admin",
          "/api/",
          "/track",
          "/orders/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
