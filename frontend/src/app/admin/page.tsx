"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

type Tab = "overview" | "kyc" | "users" | "sellers" | "orders" | "delivery";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface SellerItem {
  id: string;
  user_id: string;
  store_name: string;
  status: string;
  commission_rate: number;
  payout_balance: number;
  total_orders?: number;
  total_gross_mad?: number;
}

interface OrderItem {
  id: string;
  status: string;
  total: number;
  buyer_name: string;
  assigned_delivery_id: string | null;
  created_at: string;
}

interface AgentItem {
  id: string;
  user_id: string;
  kind: string;
  company_name: string | null;
  availability_status: string;
  rating: number;
  total_deliveries: number;
  coverage_zones: string[];
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  restricted: "bg-orange-100 text-orange-700",
  banned: "bg-red-100 text-red-700",
  verified: "bg-green-100 text-green-700",
  suspended: "bg-red-100 text-red-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  available: "bg-green-100 text-green-700",
  busy: "bg-yellow-100 text-yellow-700",
  offline: "bg-gray-100 text-gray-600",
  delivered_paid: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  in_transit: "bg-blue-100 text-blue-700",
  assigned: "bg-purple-100 text-purple-700",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  processing: "En traitement",
  assigned: "Livreur assigné",
  picked_up: "Ramassée",
  in_transit: "En transit",
  delivered_paid: "Livrée",
  delivery_failed: "Échec",
  cancelled: "Annulée",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [kycList, setKycList] = useState<KycItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [sellers, setSellers] = useState<SellerItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<SellerItem | null>(null);

  function authHeaders() {
    const token = localStorage.getItem("access_token");
    return token
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
  }

  async function fetchMetrics() {
    try {
      const res = await fetch("/api/v1/admin/metrics/", { headers: authHeaders() });
      if (res.status === 403) { window.location.href = "/auth/login"; return; }
      setMetrics(await res.json());
    } catch {}
  }

  async function fetchKyc() {
    const res = await fetch("/api/v1/admin/kyc/pending", { headers: authHeaders() });
    const d = await res.json();
    setKycList(d.items ?? []);
  }

  async function fetchUsers() {
    const res = await fetch("/api/v1/admin/users/?page_size=50", { headers: authHeaders() });
    const d = await res.json();
    setUsers(d.items ?? []);
  }

  async function fetchSellers() {
    const res = await fetch("/api/v1/seller/profile/all", { headers: authHeaders() });
    const d = await res.json();
    setSellers(Array.isArray(d) ? d : d.items ?? []);
  }

  async function fetchOrders() {
    const res = await fetch("/api/v1/admin/metrics/orders?page_size=50", { headers: authHeaders() });
    const d = await res.json();
    setOrders(Array.isArray(d) ? d : []);
  }

  async function fetchAgents() {
    const res = await fetch("/api/v1/delivery/agents/available", { headers: authHeaders() });
    const d = await res.json();
    setAgents(Array.isArray(d) ? d : []);
  }

  useEffect(() => { fetchMetrics(); }, []);

  useEffect(() => {
    setLoading(true);
    const map: Record<Tab, () => Promise<void>> = {
      overview: fetchMetrics,
      kyc: fetchKyc,
      users: fetchUsers,
      sellers: fetchSellers,
      orders: async () => { await Promise.all([fetchOrders(), fetchAgents()]); },
      delivery: fetchAgents,
    };
    map[tab]().finally(() => setLoading(false));
  }, [tab]);

  async function reviewKyc(id: string, decision: "approved" | "rejected", reason?: string) {
    setReviewing(id);
    await fetch(`/api/v1/admin/kyc/${id}/review`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ decision, rejection_reason: reason }),
    });
    await fetchKyc();
    await fetchMetrics();
    setReviewing(null);
  }

  async function updateUserStatus(userId: string, status: string) {
    await fetch(`/api/v1/admin/users/${userId}/status`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    fetchUsers();
  }

  async function updateSellerStatus(userId: string, status: string) {
    await fetch(`/api/v1/seller/profile/${userId}/admin-status`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    fetchSellers();
  }

  async function updateCommissionRate(userId: string, rate: number) {
    await fetch(`/api/v1/seller/profile/${userId}/commission`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ commission_rate: rate }),
    });
    fetchSellers();
  }

  async function assignDelivery(orderId: string, agentId: string) {
    setAssigning(orderId);
    await fetch("/api/v1/delivery/assignments/", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ order_id: orderId, agent_id: agentId }),
    });
    // Also update order status to assigned
    await fetch(`/api/v1/orders/orders/${orderId}/status`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ status: "assigned" }),
    });
    await fetchOrders();
    setAssigning(null);
  }

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "overview", label: "Vue d'ensemble" },
    { id: "kyc", label: "KYC", badge: metrics?.pending_kyc },
    { id: "users", label: "Utilisateurs" },
    { id: "sellers", label: "Vendeurs" },
    { id: "orders", label: "Commandes" },
    { id: "delivery", label: "Livreurs" },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Administration Plateforme</h1>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">← Boutique</Link>
      </header>

      <div className="px-4 py-6 mx-auto max-w-7xl">
        {/* Tab Bar */}
        <nav className="flex flex-wrap gap-1 bg-white rounded-xl shadow-sm p-1 mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? "bg-orange-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Utilisateurs", value: metrics.total_users, icon: "👤" },
              { label: "Vendeurs actifs", value: metrics.active_sellers, icon: "🏪" },
              { label: "KYC en attente", value: metrics.pending_kyc, icon: "📋", urgent: metrics.pending_kyc > 0 },
              { label: "Commandes total", value: metrics.total_orders, icon: "📦" },
              { label: "Commandes aujourd'hui", value: metrics.orders_today, icon: "🆕" },
              { label: "Chiffre d'affaires", value: `${metrics.total_revenue.toFixed(0)} MAD`, icon: "💰" },
              { label: "Livraisons en attente", value: metrics.pending_deliveries, icon: "🚚" },
            ].map(stat => (
              <div
                key={stat.label}
                className={`bg-white rounded-xl shadow-sm p-5 ${stat.urgent ? "ring-2 ring-orange-400" : ""}`}
              >
                <p className="text-2xl mb-1">{stat.icon}</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── KYC ── */}
        {tab === "kyc" && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Documents KYC en attente ({kycList.length})</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {["Nom", "Type doc", "Statut", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {kycList.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">Aucun KYC en attente</td></tr>
                )}
                {kycList.map(kyc => (
                  <tr key={kyc.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{kyc.full_name}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{kyc.doc_type.replace(/_/g, " ")}</td>
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

        {/* ── USERS ── */}
        {tab === "users" && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Utilisateurs ({users.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Email", "Nom", "Rôle", "Statut", "Inscrit le", "Actions"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 max-w-[180px] truncate">{user.email}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{user.full_name}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize text-xs whitespace-nowrap">{user.role.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[user.status] ?? "bg-gray-100"}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(user.created_at).toLocaleDateString("fr-MA")}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          defaultValue={user.status}
                          onChange={e => updateUserStatus(user.id, e.target.value)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                        >
                          {["active", "restricted", "banned", "pending"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SELLERS ── */}
        {tab === "sellers" && (
          <div className="space-y-4">
            {selectedSeller ? (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-semibold text-gray-900">Détails: {selectedSeller.store_name}</h2>
                  <button onClick={() => setSelectedSeller(null)} className="text-sm text-gray-500 hover:text-gray-700">← Retour</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  {[
                    { label: "User ID", value: selectedSeller.user_id },
                    { label: "Statut", value: selectedSeller.status },
                    { label: "Taux commission", value: `${(selectedSeller.commission_rate * 100).toFixed(1)}%` },
                    { label: "Solde disponible", value: formatPrice(selectedSeller.payout_balance) },
                    { label: "Commandes", value: selectedSeller.total_orders ?? "–" },
                    { label: "Chiffre d'affaires", value: selectedSeller.total_gross_mad ? formatPrice(selectedSeller.total_gross_mad) : "–" },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className="font-semibold text-gray-900 text-sm mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Statut vendeur</label>
                    <select
                      defaultValue={selectedSeller.status}
                      onChange={e => updateSellerStatus(selectedSeller.user_id, e.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {["pending", "verified", "suspended"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Taux commission (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      defaultValue={(selectedSeller.commission_rate * 100).toFixed(1)}
                      onBlur={e => updateCommissionRate(selectedSeller.user_id, parseFloat(e.target.value) / 100)}
                      className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <Link
                      href={`/products?seller_id=${selectedSeller.user_id}`}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                    >
                      Voir les produits
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b">
                  <h2 className="font-semibold text-gray-900">Vendeurs ({sellers.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Boutique", "Statut", "Commission", "Solde", "Actions"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sellers.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Aucun vendeur</td></tr>
                      )}
                      {sellers.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{s.store_name}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100"}`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{(s.commission_rate * 100).toFixed(1)}%</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{formatPrice(s.payout_balance)}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedSeller(s)}
                              className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                            >
                              Détails
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ORDERS ── */}
        {tab === "orders" && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Toutes les commandes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["ID", "Acheteur", "Total", "Statut", "Livreur", "Date", "Assigner"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">#{order.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{order.buyer_name}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{formatPrice(order.total)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {ORDER_STATUS_LABELS[order.status] ?? order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {order.assigned_delivery_id ? order.assigned_delivery_id.slice(0, 8) + "..." : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString("fr-MA")}
                      </td>
                      <td className="px-4 py-3">
                        {!order.assigned_delivery_id && order.status === "confirmed" ? (
                          <select
                            disabled={assigning === order.id}
                            defaultValue=""
                            onChange={e => e.target.value && assignDelivery(order.id, e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs max-w-[150px]"
                          >
                            <option value="">Assigner...</option>
                            {agents.map(a => (
                              <option key={a.user_id} value={a.user_id}>
                                {a.company_name ?? a.user_id.slice(0, 8)} ({a.availability_status})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DELIVERY AGENTS ── */}
        {tab === "delivery" && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Agents de livraison ({agents.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Agent", "Type", "Disponibilité", "Note", "Livraisons", "Zones"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agents.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Aucun agent disponible</td></tr>
                  )}
                  {agents.map(agent => (
                    <tr key={agent.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {agent.company_name ?? `Agent ${agent.user_id.slice(0, 8)}`}
                      </td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{agent.kind}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[agent.availability_status] ?? "bg-gray-100"}`}>
                          {agent.availability_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {agent.rating > 0 ? `${agent.rating.toFixed(1)} ★` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{agent.total_deliveries}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px]">
                        {agent.coverage_zones.slice(0, 3).join(", ")}
                        {agent.coverage_zones.length > 3 ? ` +${agent.coverage_zones.length - 3}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
