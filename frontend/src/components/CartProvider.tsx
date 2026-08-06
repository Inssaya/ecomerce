"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The cart lives on the phone.
 *
 * There is no server-side cart and there should not be one: it would need a
 * session for someone who has not signed in and has not decided to buy
 * anything yet. The order is created in one request at checkout, from prices
 * the server looks up itself.
 */
export interface CartLine {
  productId: string;
  slug: string;
  variantId: string | null;
  title: string;
  option: string;
  price: number;
  image: string | null;
  quantity: number;
  /** Shelf pieces are finite; the cart must not let someone exceed the count. */
  available: number | null;
}

interface CartValue {
  lines: CartLine[];
  count: number;
  total: number;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (productId: string, variantId: string | null, quantity: number) => void;
  remove: (productId: string, variantId: string | null) => void;
  clear: () => void;
  ready: boolean;
}

const KEY = "mostyle_cart";
const CartContext = createContext<CartValue | null>(null);

const same = (line: CartLine, productId: string, variantId: string | null) =>
  line.productId === productId && line.variantId === variantId;

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLines(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    } catch {
      // A corrupted cart is not worth a broken shop.
      localStorage.removeItem(KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const add = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((previous) => {
      const existing = previous.find((item) => same(item, line.productId, line.variantId));
      if (!existing) return [...previous, { ...line, quantity }];
      // Never past what exists. "Three left" means we made three.
      const ceiling = line.available ?? Number.MAX_SAFE_INTEGER;
      return previous.map((item) =>
        same(item, line.productId, line.variantId)
          ? { ...item, quantity: Math.min(item.quantity + quantity, ceiling) }
          : item,
      );
    });
  }, []);

  const setQuantity = useCallback(
    (productId: string, variantId: string | null, quantity: number) => {
      setLines((previous) =>
        quantity <= 0
          ? previous.filter((item) => !same(item, productId, variantId))
          : previous.map((item) =>
              same(item, productId, variantId)
                ? {
                    ...item,
                    quantity: Math.min(quantity, item.available ?? Number.MAX_SAFE_INTEGER),
                  }
                : item,
            ),
      );
    },
    [],
  );

  const remove = useCallback((productId: string, variantId: string | null) => {
    setLines((previous) => previous.filter((item) => !same(item, productId, variantId)));
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
      add,
      setQuantity,
      remove,
      clear: () => setLines([]),
      ready,
    }),
    [lines, add, setQuantity, remove, ready],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
