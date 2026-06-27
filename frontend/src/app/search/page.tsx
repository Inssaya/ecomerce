import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Search, Package } from "lucide-react";
import { searchProducts } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";
import type { Product } from "@/types";

export const metadata: Metadata = { title: "Search" };

interface PageProps {
  searchParams: { q?: string; page?: string };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const q = searchParams.q?.trim() ?? "";
  const page = Number(searchParams.page ?? 1);

  let result = null;
  if (q) {
    try {
      result = await searchProducts(q, { page, size: 24 });
    } catch {
      result = null;
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <form method="GET" action="/search" className="mb-8">
          <div className="flex gap-3 max-w-2xl">
            <div className="flex-1 flex items-center bg-white/5 border border-white/10 rounded-xl px-4 gap-2 focus-within:border-orange-500/50 transition-colors">
              <Search className="w-5 h-5 text-white/30 shrink-0" />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search products, brands..."
                className="flex-1 py-3 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-medium transition-colors"
            >
              Search
            </button>
          </div>
        </form>

        {q && result && (
          <p className="text-sm text-white/40 mb-6">
            {result.total} result{result.total !== 1 ? "s" : ""} for &ldquo;{q}&rdquo;
            {result.processing_time_ms > 0 && ` (${result.processing_time_ms} ms)`}
          </p>
        )}

        {!q && (
          <div className="text-center py-20 text-white/30">
            <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>Type something to search...</p>
          </div>
        )}

        {q && result && result.hits.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {result.hits.map((hit) => (
              <SearchHitCard key={hit.id as string} hit={hit} />
            ))}
          </div>
        )}

        {q && result && result.hits.length === 0 && (
          <div className="text-center py-20 text-white/30">
            <p>No results for &ldquo;{q}&rdquo;.</p>
            <Link href="/" className="text-orange-400 hover:underline text-sm mt-2 inline-block">
              Browse all stores
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchHitCard({ hit }: { hit: Record<string, unknown> }) {
  const product = hit as unknown as Product & { primary_image?: string };

  return (
    <div className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/30 transition-all duration-200 flex flex-col">
      <Link href={`/products/${product.id}`} className="block relative aspect-square overflow-hidden bg-white/5">
        {product.primary_image ? (
          <Image
            src={product.primary_image}
            alt={product.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-12 h-12 text-white/10" />
          </div>
        )}
      </Link>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <Link href={`/products/${product.id}`}>
          <h3 className="font-medium text-sm text-white/90 line-clamp-2 hover:text-white transition-colors">
            {product.title}
          </h3>
        </Link>
        <div className="flex items-center justify-between mt-auto">
          <span className="font-bold text-orange-400">
            {formatPrice(product.price, product.currency ?? "MAD")}
          </span>
          <AddToCartButton product={product} />
        </div>
      </div>
    </div>
  );
}
