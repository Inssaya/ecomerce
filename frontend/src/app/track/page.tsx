"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente de confirmation",
  confirmed: "Confirmée",
  processing: "En préparation",
  assigned: "Livreur assigné",
  picked_up: "Ramassée chez le vendeur",
  in_transit: "En cours de livraison",
  delivered_paid: "Livrée et payée",
  delivery_failed: "Échec de livraison",
  cancelled: "Annulée",
  returned: "Retournée",
};

const STATUS_STEP: Record<string, number> = {
  pending: 1,
  confirmed: 2,
  processing: 2,
  assigned: 3,
  picked_up: 3,
  in_transit: 4,
  delivered_paid: 5,
  delivery_failed: 5,
  cancelled: 0,
  returned: 0,
};

const STEPS = ["Commande reçue", "Confirmée", "Livreur assigné", "En route", "Livrée"];

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
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orders/orders/track/${token.trim()}`);
      if (!res.ok) throw new Error("Commande introuvable. Vérifiez votre code de suivi.");
      setOrder(await res.json());
    } catch (err: any) {
      setError(err.message);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }

  const step = order ? STATUS_STEP[order.status] ?? 0 : 0;
  const isCancelled = order?.status === "cancelled" || order?.status === "returned";

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Suivre ma commande</h1>
          <p className="text-gray-500 mt-2">
            Entrez votre code de suivi reçu par email ou SMS
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Code de suivi..."
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "..." : "Rechercher"}
          </button>
        </form>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {order && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-sm text-gray-500">Commande #{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{order.buyer_name}</p>
                  <p className="text-sm text-gray-500">
                    {order.delivery_address.street}, {order.delivery_address.city}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">
                    {new Date(order.created_at).toLocaleDateString("fr-MA")}
                  </p>
                  <p className="font-bold text-gray-900 mt-0.5">{formatPrice(order.total)}</p>
                  <p className="text-xs text-orange-600 font-medium">Paiement à la livraison</p>
                </div>
              </div>

              {!isCancelled ? (
                <div className="relative">
                  <div className="flex justify-between mb-2">
                    {STEPS.map((s, i) => (
                      <div key={s} className="flex flex-col items-center flex-1">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                            i + 1 <= step
                              ? "bg-orange-500 border-orange-500 text-white"
                              : "bg-white border-gray-200 text-gray-400"
                          }`}
                        >
                          {i + 1 <= step ? "✓" : i + 1}
                        </div>
                        <p className="text-center text-xs text-gray-500 mt-1 hidden sm:block leading-tight max-w-[70px]">
                          {s}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 -z-10">
                    <div
                      className="h-full bg-orange-500 transition-all duration-500"
                      style={{ width: `${Math.max(0, (step - 1) / 4) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center">
                  {STATUS_LABELS[order.status]}
                </div>
              )}

              <p className="text-center text-sm font-medium text-gray-700 mt-4">
                {STATUS_LABELS[order.status] ?? order.status}
              </p>
            </div>

            {order.events.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Historique</h2>
                <ol className="relative border-l border-gray-200 ml-2 space-y-4">
                  {order.events.map((ev) => (
                    <li key={ev.id} className="ml-4">
                      <div className="absolute -left-1.5 h-3 w-3 rounded-full border border-white bg-orange-400" />
                      <p className="text-sm font-medium text-gray-900">
                        {STATUS_LABELS[ev.status] ?? ev.status}
                      </p>
                      {ev.note && <p className="text-xs text-gray-500">{ev.note}</p>}
                      <p className="text-xs text-gray-400">
                        {new Date(ev.timestamp).toLocaleString("fr-MA")}
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
