"use client";

import { useCallback, useEffect, useState } from "react";
import type { CartItem } from "@/types";

const CART_KEY = "ecomerce_cart";

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) ?? "[]") as CartItem[];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(loadCart());
  }, []);

  const addItem = useCallback((item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === item.product_id);
      const updated = existing
        ? prev.map((i) =>
            i.product_id === item.product_id
              ? { ...i, quantity: i.quantity + (item.quantity ?? 1) }
              : i
          )
        : [...prev, { ...item, quantity: item.quantity ?? 1 }];
      saveCart(updated);
      return updated;
    });
  }, []);

  const removeItem = useCallback((product_id: string) => {
    setItems((prev) => {
      const updated = prev.filter((i) => i.product_id !== product_id);
      saveCart(updated);
      return updated;
    });
  }, []);

  const updateQuantity = useCallback((product_id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(product_id);
      return;
    }
    setItems((prev) => {
      const updated = prev.map((i) =>
        i.product_id === product_id ? { ...i, quantity } : i
      );
      saveCart(updated);
      return updated;
    });
  }, [removeItem]);

  const clearCart = useCallback(() => {
    saveCart([]);
    setItems([]);
  }, []);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, addItem, removeItem, updateQuantity, clearCart, total, count };
}
