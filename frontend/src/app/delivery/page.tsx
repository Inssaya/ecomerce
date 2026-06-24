"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

interface Assignment {
  id: string;
  order_id: string;
  status: string;
  assigned_at: string;
  notes: string | null;
  cod_collected: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  assigned: "Assignée",
  picked_up: "Ramassée",
  in_transit: "En transit",
  delivered: "Livrée",
  failed: "Échec",
  cancelled: "Annulée",
};

const NEXT_STATUS: Record<string, string> = {
  assigned: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
};

export default function DeliveryDashboardPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function fetchAssignments() {
    const token = localStorage.getItem("access_token");
    if (!token) {
      window.location.href = "/auth/login";
      return;
    }
    try {
      const res = await fetch("/api/v1/delivery/assignments/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.detail === "Profile not found") {
        window.location.href = "/delivery/onboarding";
        return;
      }
      setAssignments(Array.isArray(data) ? data : []);
    } catch {
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAssignments();
  }, []);

  async function advanceStatus(assignment: Assignment) {
    const next = NEXT_STATUS[assignment.status];
    if (!next) return;
    setUpdating(assignment.id);
    const token = localStorage.getItem("access_token");
    try {
      const payload: any = { status: next };
      if (next === "delivered") {
        payload.cod_collected = null;
      }
      await fetch(`/api/v1/delivery/assignments/${assignment.id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      await fetchAssignments();
    } finally {
      setUpdating(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </main>
    );
  }

  const active = assignments.filter((a) => !["delivered", "failed", "cancelled"].includes(a.status));
  const completed = assignments.filter((a) => ["delivered", "failed", "cancelled"].includes(a.status));

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Mes livraisons</h1>

        {active.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              En cours ({active.length})
            </h2>
            <ul className="space-y-3">
              {active.map((a) => (
                <li key={a.id} className="bg-white rounded-xl shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        Commande #{a.order_id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(a.assigned_at).toLocaleString("fr-MA")}
                      </p>
                      {a.notes && <p className="text-sm text-gray-600 mt-1">{a.notes}</p>}
                    </div>
                    <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </div>
                  {NEXT_STATUS[a.status] && (
                    <button
                      onClick={() => advanceStatus(a)}
                      disabled={updating === a.id}
                      className="w-full rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
                    >
                      {updating === a.id
                        ? "Mise à jour..."
                        : `Marquer comme: ${STATUS_LABELS[NEXT_STATUS[a.status]]}`}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {active.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center mb-6">
            <p className="text-gray-500">Aucune livraison active pour le moment</p>
          </div>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Terminées ({completed.length})
            </h2>
            <ul className="space-y-2">
              {completed.slice(0, 10).map((a) => (
                <li key={a.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      #{a.order_id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(a.assigned_at).toLocaleDateString("fr-MA")}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      a.status === "delivered"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
