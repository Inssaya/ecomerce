"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface OrderItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  subtotal: number;
  seller_id: string;
}

interface Order {
  id: string;
  status: string;
  total: number;
  buyer_name: string;
  buyer_phone: string;
  delivery_address: { street: string; city: string; region?: string };
  items: OrderItem[];
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  assigned: "Driver assigned",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered_paid: "Delivered",
  delivery_failed: "Failed",
  cancelled: "Cancelled",
  returned: "Returned",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-blue-500/20 text-blue-400",
  processing: "bg-blue-500/20 text-blue-400",
  assigned: "bg-purple-500/20 text-purple-400",
  picked_up: "bg-purple-500/20 text-purple-400",
  in_transit: "bg-orange-500/20 text-orange-400",
  delivered_paid: "bg-green-500/20 text-green-400",
  delivery_failed: "bg-red-500/20 text-red-400",
  cancelled: "bg-red-500/20 text-red-400",
  returned: "bg-white/10 text-white/50",
};

const PAGE_SIZE = 20;

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/auth/login"; return; }
    setLoading(true);

    fetch(`/api/v1/orders/orders/seller?page=${page}&size=${PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => {
        const items = Array.isArray(data) ? data : [];
        setOrders(items);
        setHasMore(items.length === PAGE_SIZE);
      })
      .catch(() => setError("Failed to load orders"))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">My orders</h1>
            <p className="text-sm text-white/40 mt-0.5">{orders.length} order{orders.length !== 1 ? "s" : ""}</p>
          </div>
          <Link
            href="/seller/dashboard"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5 transition-colors"
          >
            ← Dashboard
          </Link>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
            <p className="text-white/40">No orders yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="font-semibold text-white">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {new Date(order.created_at).toLocaleDateString("en-MA", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 ${STATUS_COLORS[order.status] ?? "bg-white/10 text-white/50"}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>

                <div className="space-y-1 mb-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-white/70 truncate max-w-[260px]">
                        {item.quantity}× {item.title}
                      </span>
                      <span className="text-white/50 flex-shrink-0 ml-2">
                        {formatPrice(item.subtotal)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div className="text-sm text-white/50">
                    <span className="font-medium text-white">{order.buyer_name}</span>
                    {" · "}{order.delivery_address.city}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-orange-400">{formatPrice(order.total)}</span>
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-xs text-orange-400 hover:underline"
                    >
                      Details →
                    </Link>
                  </div>
                </div>
              </div>
            ))}

            {(page > 1 || hasMore) && (
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 1}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-xs text-white/40">Page {page}</span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!hasMore}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
