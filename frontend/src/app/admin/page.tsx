"use client";

import { useEffect, useState } from "react";

type Tab = "overview" | "kyc" | "users" | "orders";

interface Metrics {
  total_users: number;
  active_sellers: number;
  pending_kyc: number;
  total_orders: number;
  orders_today: number;
  total_revenue: number;
  pending_deliveries: number;
}

interface KycItem {
  id: string;
  user_id: string;
  doc_type: string;
  full_name: string;
  review_status: string;
}

interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  created_at: string;
}

interface OrderItem {
  id: string;
  status: string;
  total: number;
  buyer_name: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  restricted: "bg-orange-100 text-orange-700",
  banned: "bg-red-100 text-red-700",
  verified: "bg-green-100 text-green-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [kycList, setKycList] = useState<KycItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);

  function authHeaders() {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchMetrics() {
    try {
      const res = await fetch("/api/v1/admin/metrics/", { headers: authHeaders() });
      if (res.status === 403) {
        window.location.href = "/auth/login";
        return;
      }
      setMetrics(await res.json());
    } catch {}
  }

  async function fetchKyc() {
    try {
      const res = await fetch("/api/v1/admin/kyc/pending", { headers: authHeaders() });
      const data = await res.json();
      setKycList(data.items ?? []);
    } catch {}
  }

  async function fetchUsers() {
    try {
      const res = await fetch("/api/v1/admin/users/", { headers: authHeaders() });
      const data = await res.json();
      setUsers(data.items ?? []);
    } catch {}
  }

  async function fetchOrders() {
    try {
      const res = await fetch("/api/v1/admin/metrics/orders", { headers: authHeaders() });
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {}
  }

  useEffect(() => {
    fetchMetrics();
  }, []);

  useEffect(() => {
    setLoading(true);
    const actions: Record<Tab, () => Promise<void>> = {
      overview: fetchMetrics,
      kyc: fetchKyc,
      users: fetchUsers,
      orders: fetchOrders,
    };
    actions[tab]().finally(() => setLoading(false));
  }, [tab]);

  async function reviewKyc(id: string, decision: "approved" | "rejected", reason?: string) {
    setReviewing(id);
    try {
      await fetch(`/api/v1/admin/kyc/${id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ decision, rejection_reason: reason }),
      });
      await fetchKyc();
      await fetchMetrics();
    } finally {
      setReviewing(null);
    }
  }

  async function updateUserStatus(userId: string, status: string) {
    await fetch(`/api/v1/admin/users/${userId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    await fetchUsers();
  }

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Vue d'ensemble" },
    { id: "kyc", label: "KYC", badge: metrics?.pending_kyc },
    { id: "users", label: "Utilisateurs" },
    { id: "orders", label: "Commandes" },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Administration</h1>
      </header>

      <div className="px-4 py-6 mx-auto max-w-6xl">
        <nav className="flex gap-1 bg-white rounded-xl shadow-sm p-1 mb-6 w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? "bg-orange-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        {tab === "overview" && metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Utilisateurs", value: metrics.total_users },
              { label: "Vendeurs actifs", value: metrics.active_sellers },
              { label: "KYC en attente", value: metrics.pending_kyc, urgent: metrics.pending_kyc > 0 },
              { label: "Commandes total", value: metrics.total_orders },
              { label: "Commandes aujourd'hui", value: metrics.orders_today },
              { label: "Chiffre d'affaires", value: `${metrics.total_revenue.toFixed(2)} MAD` },
              { label: "Livraisons en attente", value: metrics.pending_deliveries },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`bg-white rounded-xl shadow-sm p-5 ${stat.urgent ? "ring-2 ring-orange-400" : ""}`}
              >
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "kyc" && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Nom", "Type doc", "Statut", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {kycList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      Aucun KYC en attente
                    </td>
                  </tr>
                )}
                {kycList.map((kyc) => (
                  <tr key={kyc.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{kyc.full_name}</td>
                    <td className="px-4 py-3 text-gray-600">{kyc.doc_type}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[kyc.review_status] ?? "bg-gray-100"}`}>
                        {kyc.review_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          disabled={reviewing === kyc.id}
                          onClick={() => reviewKyc(kyc.id, "approved")}
                          className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approuver
                        </button>
                        <button
                          disabled={reviewing === kyc.id}
                          onClick={() => {
                            const reason = prompt("Raison du refus:");
                            if (reason !== null) reviewKyc(kyc.id, "rejected", reason);
                          }}
                          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Rejeter
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "users" && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Email", "Nom", "Rôle", "Statut", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 text-gray-900">{user.email}</td>
                    <td className="px-4 py-3 text-gray-600">{user.full_name}</td>
                    <td className="px-4 py-3 text-gray-600">{user.role}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[user.status] ?? "bg-gray-100"}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        defaultValue={user.status}
                        onChange={(e) => updateUserStatus(user.id, e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        {["active", "restricted", "banned", "pending"].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "orders" && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["ID", "Acheteur", "Total", "Statut", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{order.buyer_name}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{order.total} MAD</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(order.created_at).toLocaleDateString("fr-MA")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
