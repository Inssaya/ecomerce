import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Package } from "lucide-react";
import { PortalHero } from "@/components/PortalHero";
import { StoreGrid } from "@/components/StoreGrid";
import { AddToCartButton } from "@/components/AddToCartButton";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

export const metadata: Metadata = {
  title: "MoStyle — Your Style, Delivered",
  description:
    "Fashion, 3D printing, electronics and eyewear — delivered across Morocco. Cash on delivery.",
  openGraph: {
    title: "MoStyle — Your Style, Delivered",
    description: "Four stores, one address — shop clothes, electronics, 3D prints & glasses with cash on delivery.",
    type: "website",
  },
};

const INTERNAL_BASE = process.env.INTERNAL_API_URL ?? "http://gateway:8000";

async function getFeaturedProducts(): Promise<Product[]> {
  try {
    const res = await fetch(
      `${INTERNAL_BASE}/api/v1/catalog/products?status=active&size=8`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

function DarkProductCard({ product }: { product: Product }) {
  const primaryImage = product.media.find((m) => m.is_primary) ?? product.media[0];
  return (
    <div className="group bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all duration-200 flex flex-col">
      <Link href={`/products/${product.id}`} className="block relative aspect-square overflow-hidden bg-white/5">
        {primaryImage ? (
          <Image
            src={primaryImage.url}
            alt={product.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-12 h-12 text-white/20" />
          </div>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white text-sm font-semibold bg-black/60 px-3 py-1 rounded-full">
              Out of stock
            </span>
          </div>
        )}
      </Link>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <Link href={`/products/${product.id}`}>
          <h3 className="font-medium text-sm text-white/90 leading-snug line-clamp-2 hover:text-white transition-colors">
            {product.title}
          </h3>
        </Link>
        {product.category && (
          <span className="text-xs text-white/40">{product.category.name}</span>
        )}
        <div className="flex items-center justify-between gap-2 mt-auto">
          <span className="font-bold text-orange-400 text-base">
            {formatPrice(product.price, product.currency)}
          </span>
          <AddToCartButton product={product} />
        </div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const products = await getFeaturedProducts();

  return (
    <div className="min-h-screen bg-black overflow-x-hidden">
      <PortalHero />
      <StoreGrid />

      {products.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-white/10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-black text-white">New arrivals</h2>
              <p className="text-white/40 text-sm mt-1">Latest products across all stores</p>
            </div>
            <Link
              href="/products"
              className="text-sm text-orange-400 hover:text-orange-300 transition-colors"
            >
              View all →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product) => (
              <DarkProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-white/10 py-8 text-center text-sm text-white/40">
        <p>© 2026 MoStyle · Morocco</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link href="/track" className="hover:text-white/70 transition-colors">Track Order</Link>
          <Link href="/products" className="hover:text-white/70 transition-colors">All Products</Link>
          <Link href="/account" className="hover:text-white/70 transition-colors">My Account</Link>
        </div>
      </footer>
    </div>
  );
}
