"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/utils";
import { useT } from "@/hooks/useT";

const STATUS_STEP: Record<string, number> = {
  pending: 1, confirmed: 2, processing: 2,
  assigned: 3, picked_up: 3, in_transit: 4,
  delivered_paid: 5, delivery_failed: 5,
  cancelled: 0, returned: 0,
};

interface Order {
  id: string;
  tracking_token: string;
  status: string;
  buyer_name: string;
  total: number;
  delivery_address: { street: string; city: string; region?: string };
  created_at: string;
  events: Array<{ id: string; status: string; note: string | null; timestamp: string }>;
}

export default function TrackPage() {
  const { t } = useT();
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const STATUS_LABELS: Record<string, string> = {
    pending: t("Awaiting confirmation", "في انتظار التأكيد"),
    confirmed: t("Confirmed", "تم التأكيد"),
    processing: t("Being prepared", "قيد التحضير"),
    assigned: t("Driver assigned", "تم تعيين سائق"),
    picked_up: t("Picked up from warehouse", "تم الاستلام من المستودع"),
    in_transit: t("Out for delivery", "في الطريق إليك"),
    delivered_paid: t("Delivered & paid", "تم التسليم والدفع"),
    delivery_failed: t("Delivery failed", "فشل التسليم"),
    cancelled: t("Cancelled", "ملغي"),
    returned: t("Returned", "مُرجَع"),
  };

  const STEPS = [
    t("Received", "تم الاستلام"),
    t("Confirmed", "تم التأكيد"),
    t("Driver assigned", "سائق معين"),
    t("On the way", "في الطريق"),
    t("Delivered", "تم التسليم"),
  ];

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orders/orders/track/${token.trim()}`);
      if (!res.ok) throw new Error(t("Order not found. Check your tracking code.", "الطلب غير موجود. تحقق من رمز التتبع."));
      setOrder(await res.json());
    } catch (err: unknown) {
      setError((err as Error).message);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }

  const step = order ? STATUS_STEP[order.status] ?? 0 : 0;
  const isCancelled = order?.status === "cancelled" || order?.status === "returned";

  return (
    <main className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white">{t("Track my order", "تتبع طلبي")}</h1>
          <p className="text-white/50 mt-2">{t("Enter your tracking code from your email", "أدخل رمز التتبع من بريدك الإلكتروني")}</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t("Tracking code...", "رمز التتبع...")}
            className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30"
          />
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="rounded-xl bg-orange-500 hover:bg-orange-400 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          >
            {loading ? "..." : t("Track", "تتبع")}
          </button>
        </form>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-5 py-4 text-sm text-red-400 mb-6">
            {error}
          </div>
        )}

        {order && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-sm text-white/40">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="font-semibold text-white mt-0.5">{order.buyer_name}</p>
                  <p className="text-sm text-white/50">
                    {order.delivery_address.street}, {order.delivery_address.city}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/30">
                    {new Date(order.created_at).toLocaleDateString("en-MA")}
                  </p>
                  <p className="font-bold text-white mt-0.5">{formatPrice(order.total)}</p>
                  <p className="text-xs text-orange-400 font-medium">{t("Cash on delivery", "الدفع عند الاستلام")}</p>
                </div>
              </div>

              {!isCancelled ? (
                <div className="relative">
                  <div className="flex justify-between mb-2">
                    {STEPS.map((s, i) => (
                      <div key={s} className="flex flex-col items-center flex-1">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                          i + 1 <= step
                            ? "bg-orange-500 border-orange-500 text-white"
                            : "bg-white/5 border-white/20 text-white/30"
                        }`}>
                          {i + 1 <= step ? "✓" : i + 1}
                        </div>
                        <p className="text-center text-xs text-white/40 mt-1 hidden sm:block leading-tight max-w-[70px]">{s}</p>
                      </div>
                    ))}
                  </div>
                  <div className="absolute top-4 left-4 right-4 h-0.5 bg-white/10 -z-10">
                    <div
                      className="h-full bg-orange-500 transition-all duration-500"
                      style={{ width: `${Math.max(0, (step - 1) / 4) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400 text-center">
                  {STATUS_LABELS[order.status]}
                </div>
              )}

              <p className="text-center text-sm font-medium text-white/70 mt-4">
                {STATUS_LABELS[order.status] ?? order.status}
              </p>
            </div>

            {order.events.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h2 className="font-semibold text-white mb-4">{t("History", "السجل")}</h2>
                <ol className="relative border-l border-white/10 ml-2 space-y-4">
                  {order.events.map((ev) => (
                    <li key={ev.id} className="ml-4">
                      <div className="absolute -left-1.5 h-3 w-3 rounded-full border border-gray-900 bg-orange-400" />
                      <p className="text-sm font-medium text-white">{STATUS_LABELS[ev.status] ?? ev.status}</p>
                      {ev.note && <p className="text-xs text-white/50">{ev.note}</p>}
                      <p className="text-xs text-white/30">
                        {new Date(ev.timestamp).toLocaleString("en-MA")}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
