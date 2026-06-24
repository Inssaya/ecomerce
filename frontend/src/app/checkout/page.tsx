"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, total, clearCart } = useCart();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    region: "",
    zip: "",
    notes: "",
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
        delivery_address: {
          street: form.street,
          city: form.city,
          region: form.region,
          zip: form.zip,
          country: "MA",
        },
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
        throw new Error(data.detail ?? "Erreur lors de la commande");
      }

      const order = await res.json();
      clearCart();
      router.push(`/orders/${order.id}?placed=1`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600 text-lg">Votre panier est vide</p>
        <a href="/" className="text-orange-600 hover:underline">
          Continuer les achats
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">Finaliser la commande</h1>

        <div className="flex flex-col lg:flex-row gap-8">
          <form onSubmit={handleSubmit} className="flex-1 space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Informations personnelles</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet *</label>
                  <input
                    required
                    value={form.full_name}
                    onChange={set("full_name")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone *</label>
                  <input
                    required
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="+212..."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </section>

            <section className="bg-white rounded-xl shadow-sm p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Adresse de livraison</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rue / Quartier *</label>
                <input
                  required
                  value={form.street}
                  onChange={set("street")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville *</label>
                  <input
                    required
                    value={form.city}
                    onChange={set("city")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
                  <input
                    value={form.region}
                    onChange={set("region")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes de livraison</label>
                <textarea
                  value={form.notes}
                  onChange={set("notes")}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  placeholder="Instructions pour le livreur..."
                />
              </div>
            </section>

            <section className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-sm font-medium text-orange-800">Paiement à la livraison (COD)</p>
              <p className="text-xs text-orange-600 mt-0.5">
                Préparez le montant exact en espèces lors de la livraison
              </p>
            </section>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-orange-600 py-3.5 text-base font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Traitement..." : `Commander — ${formatPrice(total + DELIVERY_FEE)}`}
            </button>
          </form>

          <aside className="lg:w-80">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-4">
              <h2 className="font-semibold text-gray-900 mb-4">Récapitulatif</h2>
              <ul className="space-y-3 mb-4">
                {items.map((item) => (
                  <li key={item.product_id} className="flex gap-3 text-sm">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="h-12 w-12 rounded-md object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-gray-500">
                        {item.quantity} × {formatPrice(item.price)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t pt-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Livraison</span>
                  <span>{formatPrice(DELIVERY_FEE)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 text-base pt-1">
                  <span>Total</span>
                  <span>{formatPrice(total + DELIVERY_FEE)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
