import Link from "next/link";
import Image from "next/image";
import { Star, Package } from "lucide-react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/utils";
import { AddToCartButton } from "./AddToCartButton";

interface Props {
  product: Product;
}

export function ProductCard({ product }: Props) {
  const primaryImage = product.media.find((m) => m.is_primary) ?? product.media[0];

  return (
    <div className="group bg-white rounded-2xl border border-border overflow-hidden hover:shadow-lg transition-all duration-200 flex flex-col">
      <Link href={`/products/${product.id}`} className="block relative aspect-square overflow-hidden bg-muted">
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
            <Package className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}
        {product.stock === 0 && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-sm font-semibold bg-black/60 px-3 py-1 rounded-full">
              Out of stock
            </span>
          </div>
        )}
      </Link>

      <div className="p-4 flex flex-col flex-1 gap-2">
        <Link href={`/products/${product.id}`} className="hover:text-primary transition-colors">
          <h3 className="font-medium text-sm leading-snug line-clamp-2">{product.title}</h3>
        </Link>

        {product.category && (
          <span className="text-xs text-muted-foreground">{product.category.name}</span>
        )}

        <div className="flex items-center gap-1 mt-auto">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="text-xs text-muted-foreground">
            {product.rating.toFixed(1)} · {product.view_count} views
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-primary text-lg">
            {formatPrice(product.price, product.currency)}
          </span>
          <AddToCartButton product={product} />
        </div>
      </div>
    </div>
  );
}
