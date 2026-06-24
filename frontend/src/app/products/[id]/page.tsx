import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Star, Package, ArrowLeft, Tag } from "lucide-react";
import { getProduct } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "@/components/AddToCartButton";
import { DwellTracker } from "@/components/DwellTracker";
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
    return { title: "Produit introuvable" };
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/products" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour aux produits
        </Link>
        {product.category && (
          <>
            <span>/</span>
            <Link href={`/categories/${product.category.slug}`} className="hover:text-foreground transition-colors">
              {product.category.name}
            </Link>
          </>
        )}
      </div>

      <DwellTracker
        productId={product.id}
        categoryId={product.category_id ?? undefined}
        labelIds={product.labels.map((l) => l.id)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Images */}
        <div className="space-y-4">
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted">
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
                <Package className="w-24 h-24 text-muted-foreground/20" />
              </div>
            )}
          </div>
          {otherImages.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {otherImages.slice(0, 4).map((media) => (
                <div key={media.id} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                  <Image src={media.url} alt={product.title} fill className="object-cover" sizes="25vw" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-6">
          {product.category && (
            <Link
              href={`/categories/${product.category.slug}`}
              className="text-sm text-primary hover:underline"
            >
              {product.category.name}
            </Link>
          )}

          <h1 className="text-3xl font-bold leading-tight">{product.title}</h1>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= Math.round(product.rating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {product.rating.toFixed(1)} · {product.view_count} vues
            </span>
          </div>

          <div className="text-4xl font-extrabold text-primary">
            {formatPrice(product.price, product.currency)}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium px-3 py-1 rounded-full ${
                product.stock > 0
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {product.stock > 0 ? `${product.stock} en stock` : "Rupture de stock"}
            </span>
            <span className="text-sm text-muted-foreground">· Paiement à la livraison</span>
          </div>

          {/* Labels */}
          {product.labels.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Tag className="w-4 h-4" />
                <span>Caractéristiques</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {product.labels.map((label) => (
                  <span
                    key={label.id}
                    className="px-3 py-1 bg-secondary text-secondary-foreground text-xs rounded-full"
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Add to cart */}
          <div className="flex gap-3 pt-2">
            <AddToCartButton product={product} />
            <Link
              href="/checkout"
              className="flex-1 bg-primary text-primary-foreground text-center py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Commander maintenant
            </Link>
          </div>

          {/* Description */}
          {product.description && (
            <div className="pt-4 border-t border-border">
              <h2 className="font-semibold mb-3">Description</h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
