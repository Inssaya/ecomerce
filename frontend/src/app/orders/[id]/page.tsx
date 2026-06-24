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
  pending: "En attente",
  confirmed: "Confirmée",
  processing: "En traitement",
  assigned: "Livreur assigné",
  picked_up: "Ramassée",
  in_transit: "En transit",
  delivered_paid: "Livrée & payée",
  delivery_failed: "Échec livraison",
  cancelled: "Annulée",
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
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">Commande introuvable</p>
        <Link href="/orders" className="text-orange-600 hover:underline">
          Voir mes commandes
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        {isNew && (
          <div className="mb-6 rounded-xl bg-green-50 border border-green-200 px-5 py-4">
            <p className="font-semibold text-green-800">Commande passée avec succès!</p>
            <p className="text-sm text-green-600 mt-0.5">
              Vous recevrez une notification quand votre commande sera confirmée.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Commande #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {new Date(order.created_at).toLocaleDateString("fr-MA", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700">
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Livraison</h2>
            <p className="text-sm text-gray-900">{order.buyer_name}</p>
            <p className="text-sm text-gray-600">{order.buyer_phone}</p>
            <p className="text-sm text-gray-600 mt-1">
              {order.delivery_address.street}, {order.delivery_address.city}
              {order.delivery_address.region ? `, ${order.delivery_address.region}` : ""}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Code de suivi</h2>
            <p className="font-mono text-xs bg-gray-100 rounded px-2 py-1.5 break-all text-gray-700">
              {order.tracking_token}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Articles commandés</h2>
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
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500">
                    {item.quantity} × {formatPrice(item.price)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900">{formatPrice(item.subtotal)}</p>
              </li>
            ))}
          </ul>
          <div className="border-t mt-4 pt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Sous-total</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Livraison</span>
              <span>{formatPrice(order.delivery_fee)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900">
              <span>Total (COD)</span>
              <span>{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        {(order.events ?? []).length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Historique</h2>
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
    </main>
  );
}
