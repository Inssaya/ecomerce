"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

interface Props {
  productId: string;
}

export function SimilarProducts({ productId }: Props) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetch(`/api/v1/recommendations/similar/${productId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(async (ids: string[]) => {
        if (!Array.isArray(ids) || ids.length === 0) return;
        const results = await Promise.allSettled(
          ids.slice(0, 6).map((id) =>
            fetch(`/api/v1/catalog/products/${id}`).then((r) => r.json())
          )
        );
        setProducts(
          results
            .filter((r): r is PromiseFulfilledResult<Product> => r.status === "fulfilled" && !r.value?.detail)
            .map((r) => r.value)
        );
      })
      .catch(() => {});
  }, [productId]);

  if (products.length === 0) return null;

  return (
    <section className="mt-12 border-t border-white/10 pt-10">
      <h2 className="text-lg font-semibold text-white mb-5">You may also like</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {products.map((product) => {
          const img = product.media.find((m) => m.is_primary) ?? product.media[0];
          return (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="flex-shrink-0 w-44 group"
            >
              <div className="relative aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 mb-2">
                {img ? (
                  <Image
                    src={img.url}
                    alt={product.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="176px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-8 h-8 text-white/20" />
                  </div>
                )}
              </div>
              <p className="text-sm text-white/80 font-medium truncate group-hover:text-white transition-colors">
                {product.title}
              </p>
              <p className="text-sm text-orange-400 font-semibold mt-0.5">
                {formatPrice(product.price, product.currency)}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
