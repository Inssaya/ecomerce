"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface Order {
  id: string;
  tracking_token: string;
  status: string;
  total: number;
  created_at: string;
  buyer_name: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  assigned: "Driver assigned",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered_paid: "Delivered & paid",
  delivery_failed: "Delivery failed",
  cancelled: "Cancelled",
  returned: "Returned",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  confirmed: "bg-blue-500/20 text-blue-400",
  delivered_paid: "bg-green-500/20 text-green-400",
  cancelled: "bg-red-500/20 text-red-400",
  delivery_failed: "bg-red-500/20 text-red-400",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      window.location.href = "/auth/login";
      return;
    }
    fetch("/api/v1/orders/orders/mine", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-white mb-6">My Orders</h1>

        {orders.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
            <p className="text-white/50 mb-4">No orders yet</p>
            <Link href="/" className="text-orange-400 hover:underline text-sm">
              Start shopping
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="block bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                      <p className="text-xs text-white/40 mt-0.5">
                        {new Date(order.created_at).toLocaleDateString("en-MA", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-white/10 text-white/50"}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                      <span className="text-sm font-bold text-orange-400">{formatPrice(order.total)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
