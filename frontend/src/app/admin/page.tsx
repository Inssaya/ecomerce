"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

type Tab = "overview" | "stores" | "products" | "orders" | "users";

interface Store {
  id: string; slug: string; name: string; description: string;
  theme_color: string; whatsapp_number: string; is_active: boolean; created_at: string;
}

interface Product {
  id: string; title: string; price: number; currency: string;
  stock: number; status: string; store_id: string | null; created_at: string;
}

interface Order {
  id: string; status: string; total: number; buyer_name: string;
  buyer_email: string; created_at: string; tracking_token: string;
}

interface User {
  id: string; email: string; full_name: string | null; role: string; status: string; created_at: string;
}

interface Metrics {
  total_users?: number; total_orders?: number; total_revenue?: number;
  active_products?: number; pending_orders?: number;
}

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [metrics, setMetrics] = useState<Metrics>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // New store / product form state
  const [newStore, setNewStore] = useState({ slug: "", name: "", theme_color: "#ff6b35", whatsapp_number: "", hero_tagline: "", description: "" });
  const [newProduct, setNewProduct] = useState({ title: "", price: "", stock: "", store_id: "", description: "", status: "active" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/auth/login"; return; }

    Promise.allSettled([
      fetch("/api/v1/admin/metrics", { headers: authHeaders() }).then(r => r.json()),
      fetch("/api/v1/catalog/stores/all", { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
      fetch("/api/v1/catalog/products?size=50&status=active", { headers: authHeaders() }).then(r => r.json()).then(d => d.items ?? []),
      fetch("/api/v1/orders/orders/all?size=50", { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
      fetch("/api/v1/auth/admin/users", { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
    ]).then(([m, s, p, o, u]) => {
      if (m.status === "fulfilled") setMetrics(m.value);
      if (s.status === "fulfilled") setStores(Array.isArray(s.value) ? s.value : []);
      if (p.status === "fulfilled") setProducts(Array.isArray(p.value) ? p.value : []);
      if (o.status === "fulfilled") setOrders(Array.isArray(o.value) ? o.value : (o.value?.items ?? []));
      if (u.status === "fulfilled") setUsers(Array.isArray(u.value) ? u.value : []);
      setLoading(false);
    });
  }, []);

  async function createStore(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/v1/catalog/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(newStore),
    });
    if (res.ok) {
      const s = await res.json();
      setStores(prev => [s, ...prev]);
      setNewStore({ slug: "", name: "", theme_color: "#ff6b35", whatsapp_number: "", hero_tagline: "", description: "" });
      setMsg("Store created!");
    } else {
      setMsg("Error creating store");
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/v1/catalog/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        ...newProduct,
        price: parseFloat(newProduct.price),
        stock: parseInt(newProduct.stock),
        store_id: newProduct.store_id || null,
      }),
    });
    if (res.ok) {
      const p = await res.json();
      setProducts(prev => [p, ...prev]);
      setNewProduct({ title: "", price: "", stock: "", store_id: "", description: "", status: "active" });
      setMsg("Product created!");
    } else {
      setMsg("Error creating product");
    }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  }

  async function updateOrderStatus(orderId: string, status: string) {
    await fetch(`/api/v1/orders/orders/${orderId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  }

  async function updateUserStatus(userId: string, status: string) {
    await fetch(`/api/v1/auth/admin/users/${userId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "stores", label: "Stores" },
    { id: "products", label: "Products" },
    { id: "orders", label: "Orders" },
    { id: "users", label: "Users" },
  ];

  const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30";
  const ORDER_STATUSES = ["pending", "confirmed", "processing", "assigned", "picked_up", "in_transit", "delivered_paid", "delivery_failed", "cancelled"];

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-sm text-white/40">MoStyle Management</p>
          </div>
          {msg && <p className={`text-sm px-4 py-2 rounded-lg ${msg.includes("Error") ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"}`}>{msg}</p>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 mb-8 w-fit overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? "bg-orange-500 text-white" : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-white/40 text-center py-20">Loading...</div>
        ) : (
          <>
            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {[
                    { label: "Total Users", value: metrics.total_users ?? users.length },
                    { label: "Total Orders", value: metrics.total_orders ?? orders.length },
                    { label: "Revenue", value: formatPrice(metrics.total_revenue ?? 0) },
                    { label: "Active Products", value: metrics.active_products ?? products.length },
                    { label: "Pending Orders", value: metrics.pending_orders ?? orders.filter(o => o.status === "pending").length },
                  ].map(m => (
                    <div key={m.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
                      <p className="text-xs text-white/40 uppercase tracking-wider">{m.label}</p>
                      <p className="text-2xl font-bold text-white mt-1">{m.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <h3 className="font-semibold text-white mb-4">Recent Orders</h3>
                    <div className="space-y-2">
                      {orders.slice(0, 5).map(o => (
                        <div key={o.id} className="flex items-center justify-between text-sm">
                          <div>
                            <p className="text-white font-medium">#{o.id.slice(0, 8).toUpperCase()}</p>
                            <p className="text-white/40 text-xs">{o.buyer_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-orange-400 font-semibold">{formatPrice(o.total)}</p>
                            <span className="text-xs bg-white/10 text-white/50 rounded-full px-2 py-0.5">{o.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <h3 className="font-semibold text-white mb-4">Active Stores</h3>
                    <div className="space-y-2">
                      {stores.filter(s => s.is_active).map(s => (
                        <div key={s.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ background: s.theme_color }} />
                            <span className="text-sm text-white">{s.name}</span>
                          </div>
                          <span className="text-xs text-white/40">{s.slug}.mostyle.ma</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STORES ── */}
            {tab === "stores" && (
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="font-semibold text-white mb-4">Create New Store</h3>
                  <form onSubmit={createStore} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Slug (subdomain)</label>
                      <input required value={newStore.slug} onChange={e => setNewStore(s => ({ ...s, slug: e.target.value }))} className={inputCls} placeholder="e.g. clothes" />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Store name</label>
                      <input required value={newStore.name} onChange={e => setNewStore(s => ({ ...s, name: e.target.value }))} className={inputCls} placeholder="Fashion & Clothes" />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Theme color</label>
                      <div className="flex gap-2">
                        <input type="color" value={newStore.theme_color} onChange={e => setNewStore(s => ({ ...s, theme_color: e.target.value }))} className="h-10 w-14 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
                        <input value={newStore.theme_color} onChange={e => setNewStore(s => ({ ...s, theme_color: e.target.value }))} className={`${inputCls} flex-1`} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">WhatsApp number</label>
                      <input value={newStore.whatsapp_number} onChange={e => setNewStore(s => ({ ...s, whatsapp_number: e.target.value }))} className={inputCls} placeholder="212600000000" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-white/50 mb-1">Tagline</label>
                      <input value={newStore.hero_tagline} onChange={e => setNewStore(s => ({ ...s, hero_tagline: e.target.value }))} className={inputCls} placeholder="Your style, delivered." />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                        Create Store
                      </button>
                    </div>
                  </form>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stores.map(store => (
                    <div key={store.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg" style={{ background: store.theme_color }} />
                        <div>
                          <p className="font-semibold text-white">{store.name}</p>
                          <p className="text-xs text-white/40">{store.slug}.mostyle.ma</p>
                        </div>
                      </div>
                      {store.whatsapp_number && (
                        <p className="text-xs text-green-400">WhatsApp: +{store.whatsapp_number}</p>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <span className={`text-xs rounded-full px-2 py-0.5 ${store.is_active ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40"}`}>
                          {store.is_active ? "Active" : "Inactive"}
                        </span>
                        <a href={`/store/${store.slug}`} target="_blank" className="text-xs text-orange-400 hover:underline">
                          View →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── PRODUCTS ── */}
            {tab === "products" && (
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <h3 className="font-semibold text-white mb-4">Add Product</h3>
                  <form onSubmit={createProduct} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-white/50 mb-1">Product title</label>
                      <input required value={newProduct.title} onChange={e => setNewProduct(p => ({ ...p, title: e.target.value }))} className={inputCls} placeholder="Product name" />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Price (MAD)</label>
                      <input required type="number" min="0" step="0.01" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} className={inputCls} placeholder="299.00" />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Stock</label>
                      <input required type="number" min="0" value={newProduct.stock} onChange={e => setNewProduct(p => ({ ...p, stock: e.target.value }))} className={inputCls} placeholder="100" />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Store</label>
                      <select value={newProduct.store_id} onChange={e => setNewProduct(p => ({ ...p, store_id: e.target.value }))} className={inputCls}>
                        <option value="">— No store —</option>
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Status</label>
                      <select value={newProduct.status} onChange={e => setNewProduct(p => ({ ...p, status: e.target.value }))} className={inputCls}>
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="paused">Paused</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-white/50 mb-1">Description</label>
                      <input value={newProduct.description} onChange={e => setNewProduct(p => ({ ...p, description: e.target.value }))} className={inputCls} placeholder="Product description..." />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                        Add Product
                      </button>
                    </div>
                  </form>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="border-b border-white/10">
                      <tr className="text-left text-white/40 text-xs uppercase">
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Store</th>
                        <th className="px-4 py-3">Price</th>
                        <th className="px-4 py-3">Stock</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {products.map(p => {
                        const store = stores.find(s => s.id === p.store_id);
                        return (
                          <tr key={p.id} className="hover:bg-white/5">
                            <td className="px-4 py-3 text-white font-medium">{p.title}</td>
                            <td className="px-4 py-3 text-white/50">{store?.name ?? "—"}</td>
                            <td className="px-4 py-3 text-orange-400 font-semibold">{formatPrice(p.price)}</td>
                            <td className="px-4 py-3 text-white/70">{p.stock}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs rounded-full px-2 py-0.5 ${p.status === "active" ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40"}`}>
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── ORDERS ── */}
            {tab === "orders" && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr className="text-left text-white/40 text-xs uppercase">
                      <th className="px-4 py-3">Order</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {orders.map(o => (
                      <tr key={o.id} className="hover:bg-white/5">
                        <td className="px-4 py-3 text-white font-mono text-xs">#{o.id.slice(0, 8).toUpperCase()}</td>
                        <td className="px-4 py-3">
                          <p className="text-white">{o.buyer_name}</p>
                          <p className="text-white/40 text-xs">{o.buyer_email}</p>
                        </td>
                        <td className="px-4 py-3 text-orange-400 font-semibold">{formatPrice(o.total)}</td>
                        <td className="px-4 py-3 text-white/50 text-xs">{new Date(o.created_at).toLocaleDateString("en-MA")}</td>
                        <td className="px-4 py-3">
                          <select
                            value={o.status}
                            onChange={e => updateOrderStatus(o.id, e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                          >
                            {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && <p className="text-white/30 text-center py-8">No orders yet</p>}
              </div>
            )}

            {/* ── USERS ── */}
            {tab === "users" && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr className="text-left text-white/40 text-xs uppercase">
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Joined</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-white/5">
                        <td className="px-4 py-3">
                          <p className="text-white font-medium">{u.full_name ?? "—"}</p>
                          <p className="text-white/40 text-xs">{u.email}</p>
                        </td>
                        <td className="px-4 py-3 text-white/60 capitalize">{u.role.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 text-white/40 text-xs">{new Date(u.created_at).toLocaleDateString("en-MA")}</td>
                        <td className="px-4 py-3">
                          <select
                            value={u.status}
                            onChange={e => updateUserStatus(u.id, e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                          >
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
                            <option value="pending">Pending</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.length === 0 && <p className="text-white/30 text-center py-8">No users yet</p>}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
