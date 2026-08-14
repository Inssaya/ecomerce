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
/** One line of specification the buyer picked, frozen at add-to-cart time. */
export interface CartSelection {
  group: "measure" | "color" | "material";
  name: string | null;
  value: string;
  hex: string | null;
}

export interface CartLine {
  productId: string;
  slug: string;
  variantId: string | null;
  title: string;
  option: string;
  /** The unit price shown here, already reflecting a live reduction. The
   *  server prices the order again on checkout, so this is a display value —
   *  not the amount that will be collected. */
  price: number;
  image: string | null;
  quantity: number;
  /**
   * Historically the "how many are still on the shelf" ceiling. The shop does
   * not count units any more, so callers pass `null` and nothing clamps
   * against it. Kept in the shape so a cart written by an older tab loads
   * without a `JSON.parse` shrug.
   */
  available: number | null;
  /** Which colour / size / material they chose. Empty when the piece offers
   *  nothing to pick, and stored either way so a stray cart with the field
   *  missing does not crash the reducer that reads it. */
  selection: CartSelection[];
  /** Their name on the piece, when they turned personalization on. Capped at
   *  20 characters on the piece page and again on the server. */
  personalization: string | null;
}

interface CartValue {
  lines: CartLine[];
  count: number;
  total: number;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  /** Same identity function the reducer uses, exposed so pages that render
   *  the list can key controls by it without recomputing the shape. */
  idOf: (line: CartLine) => string;
  clear: () => void;
  ready: boolean;
}

const KEY = "mostyle_cart";
const CartContext = createContext<CartValue | null>(null);

/**
 * A stable identity for a cart line, so two of the same piece with different
 * choices stay two lines. Selection is order-sensitive because the shop lists
 * measures/colours/materials in a fixed order — nothing here reorders them.
 */
function identityOf(line: {
  productId: string;
  variantId: string | null;
  selection?: CartSelection[];
  personalization?: string | null;
}): string {
  const picks = (line.selection ?? [])
    .map((item) => `${item.group}:${item.name ?? ""}:${item.value}`)
    .join("|");
  return `${line.productId}::${line.variantId ?? ""}::${picks}::${line.personalization ?? ""}`;
}

const same = (line: CartLine, id: string) => identityOf(line) === id;

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
      const id = identityOf(line);
      const existing = previous.find((item) => identityOf(item) === id);
      if (!existing) return [...previous, { ...line, quantity }];
      return previous.map((item) =>
        identityOf(item) === id ? { ...item, quantity: item.quantity + quantity } : item,
      );
    });
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setLines((previous) =>
      quantity <= 0
        ? previous.filter((item) => !same(item, id))
        : previous.map((item) => (same(item, id) ? { ...item, quantity } : item)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setLines((previous) => previous.filter((item) => !same(item, id)));
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
      add,
      setQuantity,
      remove,
      idOf: identityOf,
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
