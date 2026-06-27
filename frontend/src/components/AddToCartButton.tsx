"use client";

import { ShoppingCart, Check } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/types";
import { useCart } from "@/hooks/useCart";
import { cn } from "@/lib/utils";

export function AddToCartButton({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (product.stock === 0) return;
    const media = product.media ?? [];
    const primaryImage = media.find((m) => m.is_primary) ?? media[0];
    addItem({
      product_id: product.id,
      seller_id: product.seller_id,
      title: product.title,
      price: product.price,
      currency: product.currency,
      image_url: primaryImage?.url ?? null,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <button
      onClick={handleClick}
      disabled={product.stock === 0}
      className={cn(
        "p-2 rounded-xl transition-all",
        added
          ? "bg-green-500/20 text-green-400"
          : product.stock === 0
          ? "bg-white/5 text-white/20 cursor-not-allowed"
          : "bg-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white"
      )}
      aria-label="Add to cart"
    >
      {added ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
    </button>
  );
}
