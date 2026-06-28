"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatPrice } from "@/lib/utils";

interface OrderItem {
  id: string;
  title: string;
  price: number;
  quantity: number;
  subtotal: number;
  image_url: string | null;
}

interface OrderEvent {
  id: string;
  status: string;
  note: string | null;
  timestamp: string;
}

interface Order {
  id: string;
  tracking_token: string;
  status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  buyer_name: string;
  buyer_phone: string;
  delivery_address: {
    street: string;
    city: string;
    region?: string;
  };
  items: OrderItem[];
  events: OrderEvent[];
  created_at: string;
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
};

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const isNew = searchParams.get("placed") === "1";
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`/api/v1/orders/orders/${params.id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => setOrder(data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-white/50">Order not found</p>
        <Link href="/orders" className="text-orange-400 hover:underline text-sm">
          View my orders
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        {isNew && (
          <div className="mb-6 rounded-xl bg-green-500/10 border border-green-500/30 px-5 py-4">
            <p className="font-semibold text-green-400">Order placed successfully!</p>
            <p className="text-sm text-green-400/70 mt-0.5">
              You&apos;ll receive a notification when your order is confirmed.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">
              Order #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-sm text-white/40 mt-0.5">
              {new Date(order.created_at).toLocaleDateString("en-MA", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span className="rounded-full bg-orange-500/20 px-3 py-1 text-sm font-medium text-orange-400">
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white/70 mb-3">Delivery address</h2>
            <p className="text-sm text-white">{order.buyer_name}</p>
            <p className="text-sm text-white/60">{order.buyer_phone}</p>
            <p className="text-sm text-white/60 mt-1">
              {order.delivery_address.street}, {order.delivery_address.city}
              {order.delivery_address.region ? `, ${order.delivery_address.region}` : ""}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white/70 mb-3">Tracking code</h2>
            <p className="font-mono text-xs bg-white/5 rounded px-2 py-1.5 break-all text-white/70">
              {order.tracking_token}
            </p>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-white/70 mb-4">Items ordered</h2>
          <ul className="space-y-3">
            {(order.items ?? []).map((item) => (
              <li key={item.id} className="flex gap-3">
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="text-xs text-white/40">
                    {item.quantity} × {formatPrice(item.price)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-orange-400">{formatPrice(item.subtotal)}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-white/10 mt-4 pt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-white/50">
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-white/50">
              <span>Delivery</span>
              <span>{formatPrice(order.delivery_fee)}</span>
            </div>
            <div className="flex justify-between font-bold text-white">
              <span>Total (COD)</span>
              <span className="text-orange-400">{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        {(order.events ?? []).length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white/70 mb-4">Order history</h2>
            <ol className="relative border-l border-white/10 ml-2 space-y-4">
              {order.events.map((ev) => (
                <li key={ev.id} className="ml-4">
                  <div className="absolute -left-1.5 h-3 w-3 rounded-full border border-gray-950 bg-orange-400" />
                  <p className="text-sm font-medium text-white">
                    {STATUS_LABELS[ev.status] ?? ev.status}
                  </p>
                  {ev.note && <p className="text-xs text-white/40">{ev.note}</p>}
                  <p className="text-xs text-white/30">
                    {new Date(ev.timestamp).toLocaleString("en-MA")}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </main>
  );
}
