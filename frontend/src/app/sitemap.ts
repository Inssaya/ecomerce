import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://mostyle.ma";
const INTERNAL = process.env.INTERNAL_API_URL ?? "http://catalog-service:8002";

const STORES = ["clothes", "3dprint", "electronics", "glasses"];

async function fetchProducts(): Promise<Array<{ id: string; updated_at?: string }>> {
  try {
    const res = await fetch(`${INTERNAL}/products?size=500&status=active`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await fetchProducts();

  const statics: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/search`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    ...STORES.map((slug) => ({
      url: `${BASE}/store/${slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
  ];

  const productUrls: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${BASE}/products/${p.id}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...statics, ...productUrls];
}
