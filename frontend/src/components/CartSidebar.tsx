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
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-gray-900 border-l border-white/10 z-50 shadow-2xl flex flex-col transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="font-bold text-lg text-white">Cart ({count})</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-white/40">
              <ShoppingBag className="w-16 h-16 opacity-20" />
              <p>Your cart is empty</p>
              <button onClick={onClose} className="text-orange-400 hover:underline text-sm">
                Continue shopping
              </button>
            </div>
          )}

          {items.map((item) => (
            <div key={item.product_id} className="flex gap-3 bg-white/5 rounded-xl p-3">
              <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                {item.image_url ? (
                  <Image src={item.image_url} alt={item.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 text-white/20" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white line-clamp-2">{item.title}</p>
                <p className="text-orange-400 font-semibold text-sm mt-1">
                  {formatPrice(item.price, item.currency)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                    className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center hover:border-white/50 transition-colors text-white"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-sm text-white w-5 text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                    className="w-6 h-6 rounded-full border border-white/20 flex items-center justify-center hover:border-white/50 transition-colors text-white"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => removeItem(item.product_id)}
                    className="ml-auto text-xs text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <div className="border-t border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between font-bold text-lg text-white">
              <span>Total</span>
              <span className="text-orange-400">{formatPrice(total)}</span>
            </div>
            <p className="text-xs text-white/40 text-center">Cash on delivery — pay when received</p>
            <Link
              href="/checkout"
              onClick={onClose}
              className="block w-full bg-orange-500 hover:bg-orange-400 text-white text-center py-3 rounded-xl font-semibold transition-colors"
            >
              Checkout
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
