"use client";

import { X, Minus, Plus, ShoppingBag } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CartSidebar({ open, onClose }: Props) {
  const { items, removeItem, updateQuantity, total, count } = useCart();

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white z-50 shadow-2xl flex flex-col transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-bold text-lg">Mon panier ({count})</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <ShoppingBag className="w-16 h-16 opacity-20" />
              <p>Votre panier est vide</p>
              <Link
                href="/products"
                onClick={onClose}
                className="text-primary underline text-sm"
              >
                Découvrir nos produits
              </Link>
            </div>
          )}

          {items.map((item) => (
            <div key={item.product_id} className="flex gap-3 bg-muted/40 rounded-xl p-3">
              <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                {item.image_url ? (
                  <Image src={item.image_url} alt={item.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                <p className="text-primary font-semibold text-sm mt-1">
                  {formatPrice(item.price, item.currency)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                    className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:border-primary transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-sm w-5 text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                    className="w-6 h-6 rounded-full border border-border flex items-center justify-center hover:border-primary transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => removeItem(item.product_id)}
                    className="ml-auto text-xs text-destructive hover:underline"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border p-5 space-y-4">
            <div className="flex items-center justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-primary">{formatPrice(total)}</span>
            </div>
            <Link
              href="/checkout"
              onClick={onClose}
              className="block w-full bg-primary text-primary-foreground text-center py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Passer la commande
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
