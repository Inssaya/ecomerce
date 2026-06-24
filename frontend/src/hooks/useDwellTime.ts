"use client";

import { useEffect, useRef } from "react";

interface DwellOptions {
  productId: string;
  categoryId?: string;
  labelIds?: string[];
  source?: string;
}

export function useDwellTime({ productId, categoryId, labelIds = [], source = "product_page" }: DwellOptions) {
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    startRef.current = Date.now();

    return () => {
      const dwellMs = Date.now() - startRef.current;
      if (dwellMs < 500) return;

      const guestId = (() => {
        let id = localStorage.getItem("guest_id");
        if (!id) {
          id = crypto.randomUUID();
          localStorage.setItem("guest_id", id);
        }
        return id;
      })();

      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        headers["X-Guest-ID"] = guestId;
      }

      navigator.sendBeacon
        ? (() => {
            const blob = new Blob(
              [JSON.stringify({ product_id: productId, dwell_ms: dwellMs, source, category_id: categoryId ?? null, label_ids: labelIds })],
              { type: "application/json" }
            );
            navigator.sendBeacon("/api/v1/recommendations/events/view", blob);
          })()
        : fetch("/api/v1/recommendations/events/view", {
            method: "POST",
            headers,
            body: JSON.stringify({ product_id: productId, dwell_ms: dwellMs, source, category_id: categoryId ?? null, label_ids: labelIds }),
            keepalive: true,
          }).catch(() => {});
    };
  }, [productId, categoryId, labelIds, source]);
}
