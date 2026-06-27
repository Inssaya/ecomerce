"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, total, clearCart } = useCart();
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "",
    street: "", city: "", region: "", zip: "", notes: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const DELIVERY_FEE = 20;

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const payload = {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        delivery_address: { street: form.street, city: form.city, region: form.region, zip: form.zip, country: "MA" },
        cart_items: items.map((item) => ({
          product_id: item.product_id,
          seller_id: item.seller_id ?? "",
          title: item.title,
          price: item.price,
          quantity: item.quantity,
          image_url: item.image_url ?? null,
        })),
        notes: form.notes || null,
      };

      const res = await fetch("/api/v1/orders/orders/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Order failed");
      }

      const order = await res.json();
      clearCart();
      router.push(`/orders/${order.id}?placed=1`);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <p className="text-white/60 text-lg">Your cart is empty</p>
        <a href="/" className="text-orange-400 hover:underline">Continue shopping</a>
      </main>
    );
  }

  const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30";

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-white mb-8">Complete your order</h1>

        <div className="flex flex-col lg:flex-row gap-8">
          <form onSubmit={handleSubmit} className="flex-1 space-y-6">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-white">Personal information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Full name *</label>
                  <input required value={form.full_name} onChange={set("full_name")} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Phone *</label>
                  <input required type="tel" value={form.phone} onChange={set("phone")} className={inputCls} placeholder="+212..." />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Email</label>
                <input type="email" value={form.email} onChange={set("email")} className={inputCls} />
              </div>
            </section>

            <section className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-white">Delivery address</h2>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Street / Neighborhood *</label>
                <input required value={form.street} onChange={set("street")} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">City *</label>
                  <input required value={form.city} onChange={set("city")} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Region</label>
                  <input value={form.region} onChange={set("region")} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1">Delivery notes</label>
                <textarea
                  value={form.notes}
                  onChange={set("notes")}
                  rows={2}
                  className={`${inputCls} resize-none`}
                  placeholder="Instructions for delivery..."
                />
              </div>
            </section>

            <section className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
              <p className="text-sm font-medium text-orange-300">Cash on delivery (COD)</p>
              <p className="text-xs text-orange-400/70 mt-0.5">
                Have the exact amount ready when your order arrives
              </p>
            </section>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-orange-500 hover:bg-orange-400 py-3.5 text-base font-semibold text-white disabled:opacity-50 transition-colors"
            >
              {loading ? "Placing order..." : `Place Order — ${formatPrice(total + DELIVERY_FEE)}`}
            </button>
          </form>

          <aside className="lg:w-80">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 sticky top-20">
              <h2 className="font-semibold text-white mb-4">Order Summary</h2>
              <ul className="space-y-3 mb-4">
                {items.map((item) => (
                  <li key={item.product_id} className="flex gap-3 text-sm">
                    {item.image_url && (
                      <img src={item.image_url} alt={item.title} className="h-12 w-12 rounded-md object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{item.title}</p>
                      <p className="text-white/50">{item.quantity} × {formatPrice(item.price)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-white/10 pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-white/50">
                  <span>Subtotal</span><span>{formatPrice(total)}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>Delivery</span><span>{formatPrice(DELIVERY_FEE)}</span>
                </div>
                <div className="flex justify-between font-bold text-white text-base pt-1">
                  <span>Total</span><span className="text-orange-400">{formatPrice(total + DELIVERY_FEE)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
