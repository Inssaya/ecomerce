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
  assigned: "Assigned",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
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
      const payload: Record<string, unknown> = { status: next };
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  const active = assignments.filter((a) => !["delivered", "failed", "cancelled"].includes(a.status));
  const completed = assignments.filter((a) => ["delivered", "failed", "cancelled"].includes(a.status));

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-white mb-6">My deliveries</h1>

        {active.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
              Active ({active.length})
            </h2>
            <ul className="space-y-3">
              {active.map((a) => (
                <li key={a.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-white">
                        Order #{a.order_id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-white/40 mt-0.5">
                        {new Date(a.assigned_at).toLocaleString("en-MA")}
                      </p>
                      {a.notes && <p className="text-sm text-white/60 mt-1">{a.notes}</p>}
                    </div>
                    <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-medium text-orange-400">
                      {STATUS_LABELS[a.status] ?? a.status}
                    </span>
                  </div>
                  {NEXT_STATUS[a.status] && (
                    <button
                      onClick={() => advanceStatus(a)}
                      disabled={updating === a.id}
                      className="w-full rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-50 transition-colors"
                    >
                      {updating === a.id
                        ? "Updating..."
                        : `Mark as: ${STATUS_LABELS[NEXT_STATUS[a.status]]}`}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {active.length === 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center mb-6">
            <p className="text-white/40">No active deliveries at the moment</p>
          </div>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">
              Completed ({completed.length})
            </h2>
            <ul className="space-y-2">
              {completed.slice(0, 10).map((a) => (
                <li
                  key={a.id}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      #{a.order_id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="text-xs text-white/40">
                      {new Date(a.assigned_at).toLocaleDateString("en-MA")}
                    </p>
                    {a.cod_collected != null && (
                      <p className="text-xs text-green-400 mt-0.5">
                        COD: {formatPrice(a.cod_collected)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      a.status === "delivered"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-white/10 text-white/50"
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
