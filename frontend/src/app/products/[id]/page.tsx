import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Star, Package, ArrowLeft, Tag } from "lucide-react";
import { getProduct } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";
import { SimilarProducts } from "@/components/SimilarProducts";
import { ProductViewTracker } from "@/components/ProductViewTracker";
import { notFound } from "next/navigation";

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const product = await getProduct(params.id);
    return {
      title: product.title,
      description: product.description.slice(0, 160),
      openGraph: {
        images: product.media.find((m) => m.is_primary)?.url
          ? [product.media.find((m) => m.is_primary)!.url]
          : [],
      },
    };
  } catch {
    return { title: "Product not found" };
  }
}

export default async function ProductDetailPage({ params }: PageProps) {
  let product;
  try {
    product = await getProduct(params.id);
  } catch {
    notFound();
  }

  const primaryImage = product.media.find((m) => m.is_primary) ?? product.media[0];
  const otherImages = product.media.filter((m) => !m.is_primary);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.media.map((m) => m.url),
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency ?? "MAD",
      price: product.price,
      availability:
        product.stock > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "MoStyle" },
    },
    ...(product.rating > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.view_count,
          },
        }
      : {}),
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductViewTracker productId={params.id} categoryId={product.category_id ?? undefined} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/40 mb-6">
          <Link href="/" className="flex items-center gap-1 hover:text-white/70 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            MoStyle
          </Link>
          {product.category && (
            <>
              <span>/</span>
              <span className="text-white/60">{product.category.name}</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Images */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/5 border border-white/10">
              {primaryImage ? (
                <Image
                  src={primaryImage.url}
                  alt={product.title}
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-24 h-24 text-white/20" />
                </div>
              )}
            </div>
            {otherImages.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {otherImages.slice(0, 4).map((media) => (
                  <div key={media.id} className="relative aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10">
                    <Image src={media.url} alt={product.title} fill className="object-cover" sizes="25vw" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-6">
            {product.category && (
              <span className="text-xs font-medium text-white/40 uppercase tracking-widest">
                {product.category.name}
              </span>
            )}

            <h1 className="text-3xl font-bold text-white leading-tight">{product.title}</h1>

            {product.rating > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${
                        star <= Math.round(product.rating)
                          ? "fill-amber-400 text-amber-400"
                          : "text-white/20"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-white/40">
                  {product.rating.toFixed(1)} · {product.view_count} views
                </span>
              </div>
            )}

            <div className="flex items-center gap-4">
              <span className="text-4xl font-extrabold text-orange-400">
                {formatPrice(product.price, product.currency)}
              </span>
              <span className="text-sm text-green-400 font-medium">Cash on delivery</span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium px-3 py-1 rounded-full ${
                  product.stock > 0
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
              </span>
            </div>

            {/* Labels */}
            {product.labels.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-white/40">
                  <Tag className="w-4 h-4" />
                  <span>Details</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {product.labels.map((label) => (
                    <span
                      key={label.id}
                      className="px-3 py-1 bg-white/10 text-white/60 text-xs rounded-full"
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Add to cart */}
            <div className="flex gap-3 pt-2">
              <div className="flex-1">
                <AddToCartButton product={product} />
              </div>
              <Link
                href="/checkout"
                className="flex-1 bg-orange-500 hover:bg-orange-400 text-white text-center py-3 rounded-xl font-semibold transition-colors"
              >
                Order now
              </Link>
            </div>

            <div className="border border-white/10 rounded-xl p-4 text-sm text-white/40 space-y-1.5">
              <p className="flex items-center gap-2"><span>✓</span> Cash on delivery — pay when you receive</p>
              <p className="flex items-center gap-2"><span>✓</span> Free returns within 7 days</p>
              <p className="flex items-center gap-2"><span>✓</span> Delivery across Morocco</p>
            </div>

            {/* Description */}
            {product.description && (
              <div className="pt-4 border-t border-white/10">
                <h2 className="font-semibold text-white mb-3">Description</h2>
                <p className="text-sm text-white/60 leading-relaxed whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}
          </div>
        </div>

        <SimilarProducts productId={params.id} />
      </div>
    </div>
  );
}
