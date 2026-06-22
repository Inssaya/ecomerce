import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Search, Package } from "lucide-react";
import { searchProducts } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";
import type { Product } from "@/types";

export const metadata: Metadata = { title: "Recherche" };

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Search bar */}
      <form method="GET" action="/search" className="mb-8">
        <div className="flex gap-3 max-w-2xl">
          <div className="flex-1 flex items-center bg-white border border-border rounded-xl px-4 gap-2 focus-within:border-primary transition-colors">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Rechercher des produits, marques..."
              className="flex-1 py-3 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Rechercher
          </button>
        </div>
      </form>

      {q && result && (
        <p className="text-sm text-muted-foreground mb-6">
          {result.total} résultat{result.total !== 1 ? "s" : ""} pour &ldquo;{q}&rdquo;
          {result.processing_time_ms > 0 && ` (${result.processing_time_ms} ms)`}
        </p>
      )}

      {!q && (
        <div className="text-center py-20 text-muted-foreground">
          <Search className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p>Tapez quelque chose pour rechercher...</p>
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
        <div className="text-center py-20 text-muted-foreground">
          <p>Aucun résultat pour &ldquo;{q}&rdquo;.</p>
          <Link href="/products" className="text-primary hover:underline text-sm mt-2 inline-block">
            Parcourir tous les produits
          </Link>
        </div>
      )}
    </div>
  );
}

function SearchHitCard({ hit }: { hit: Record<string, unknown> }) {
  const product = hit as unknown as Product & { primary_image?: string };

  return (
    <div className="group bg-white rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-all duration-200 flex flex-col">
      <Link href={`/products/${product.id}`} className="block relative aspect-square overflow-hidden bg-muted">
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
            <Package className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
      </Link>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <Link href={`/products/${product.id}`}>
          <h3 className="font-medium text-sm line-clamp-2 hover:text-primary transition-colors">
            {product.title}
          </h3>
        </Link>
        {product.category_name && (
          <span className="text-xs text-muted-foreground">{product.category_name as string}</span>
        )}
        <div className="flex items-center justify-between mt-auto">
          <span className="font-bold text-primary">
            {formatPrice(product.price, product.currency ?? "MAD")}
          </span>
          <AddToCartButton product={product} />
        </div>
      </div>
    </div>
  );
}
