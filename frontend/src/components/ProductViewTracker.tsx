"use client";

import { useEffect, useRef } from "react";
import { getVisitorId } from "@/lib/fingerprint";

interface Props {
  productId: string;
  categoryId?: string;
}

export function ProductViewTracker({ productId, categoryId }: Props) {
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    startRef.current = Date.now();

    async function track(dwellMs: number) {
      const visitorId = await getVisitorId();
      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        headers["X-Guest-ID"] = visitorId;
      }
      try {
        await fetch("/api/v1/recommendations/events/view", {
          method: "POST",
          headers,
          body: JSON.stringify({
            product_id: productId,
            dwell_ms: dwellMs,
            source: "product_page",
            ...(categoryId ? { category_id: categoryId } : {}),
          }),
          keepalive: true,
        });
      } catch {
        // silent — tracking is best-effort
      }
    }

    track(0);

    return () => {
      const dwell = Date.now() - startRef.current;
      track(dwell);
    };
  }, [productId, categoryId]);

  return null;
}
