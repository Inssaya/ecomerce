"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface RecommendedProduct {
  id: string;
  title: string;
  price: number;
  currency?: string;
  primary_image?: string;
  media?: Array<{ url: string; is_primary: boolean }>;
}

interface Props {
  title?: string;
}

export function RecommendationRail({ title = "Recommandé pour vous" }: Props) {
  const [products, setProducts] = useState<RecommendedProduct[]>([]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    const endpoint = token
      ? "/api/v1/recommendations/"
      : "/api/v1/recommendations/trending";

    fetch(endpoint, { headers })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        const items: RecommendedProduct[] = Array.isArray(data) ? data : (data.items ?? []);
        setProducts(items.slice(0, 12));
      })
      .catch(() => {});
  }, []);

  if (products.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <h2 className="text-2xl font-bold mb-4">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide -mx-1 px-1">
        {products.map((product) => {
          const media = product.media ?? [];
          const image =
            product.primary_image ??
            media.find((m) => m.is_primary)?.url ??
            media[0]?.url;
          return (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="flex-shrink-0 w-44 snap-start group"
            >
              <div className="aspect-square w-full rounded-xl overflow-hidden bg-gray-100 mb-2">
                {image ? (
                  <img
                    src={image}
                    alt={product.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-300 text-4xl">
                    ?
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-tight mb-1">
                {product.title}
              </p>
              <p className="text-sm font-bold text-orange-600">
                {formatPrice(product.price, product.currency ?? "MAD")}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
