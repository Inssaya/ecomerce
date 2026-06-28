"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
}

const ORDER_STATUS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  assigned: "Driver assigned",
  picked_up: "Picked up",
  in_transit: "On the way",
  delivered_paid: "Delivered",
  delivery_failed: "Failed",
  cancelled: "Cancelled",
  returned: "Returned",
};

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"profile" | "orders" | "security">("profile");
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [orders, setOrders] = useState<Array<{
    id: string; tracking_token: string; status: string; total: number; created_at: string;
  }>>([]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/auth/login"; return; }
    Promise.all([
      fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/v1/orders/orders/mine", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []),
    ]).then(([u, o]) => {
      setUser(u);
      setForm({ full_name: u.full_name ?? "", phone: u.phone ?? "" });
      setOrders(Array.isArray(o) ? o : (o.items ?? []));
    });
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem("access_token");
    await fetch("/api/v1/auth/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (pwForm.next !== pwForm.confirm) { setPwError("Passwords do not match"); return; }
    if (pwForm.next.length < 8) { setPwError("Password must be at least 8 characters"); return; }
    const token = localStorage.getItem("access_token");
    const res = await fetch("/api/v1/auth/me/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next }),
    });
    if (res.ok) {
      setPwForm({ current: "", next: "", confirm: "" });
      setPwMsg("Password changed successfully");
      setTimeout(() => setPwMsg(""), 3000);
    } else {
      const data = await res.json().catch(() => ({}));
      setPwError(data.detail ?? "Failed to change password");
    }
  }

  async function handleLogout() {
    const refresh = localStorage.getItem("refresh_token");
    if (refresh) {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      }).catch(() => {});
    }
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.href = "/";
  }

  if (!user) return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-white/40">Loading...</p>
    </main>
  );

  const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30";

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">My Account</h1>
            <p className="text-sm text-white/40">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>

        <nav className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 mb-6 w-fit">
          {(["profile", "orders", "security"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t ? "bg-orange-500 text-white" : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              {t === "profile" ? "Profile" : t === "orders" ? "Orders" : "Security"}
            </button>
          ))}
        </nav>

        {tab === "profile" && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-4">Personal Information</h2>
              <form onSubmit={saveProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Full name</label>
                  <input
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Phone</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className={inputCls}
                    placeholder="+212..."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-orange-500 hover:bg-orange-400 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                  {saved && <p className="text-sm text-green-400">Saved!</p>}
                </div>
              </form>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/70">Account type</p>
                <p className="text-sm text-white/40 capitalize">{user.role.replace(/_/g, " ")}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                user.status === "active" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
              }`}>
                {user.status}
              </span>
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-3">
            {orders.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                <p className="text-white/40 mb-3">No orders yet</p>
                <Link href="/" className="text-orange-400 hover:underline text-sm">Start shopping</Link>
              </div>
            ) : orders.map(order => (
              <div key={order.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">#{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {new Date(order.created_at).toLocaleDateString("en-MA")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-orange-400">
                    {formatPrice(order.total)}
                  </span>
                  <span className="text-xs bg-white/10 text-white/60 rounded-full px-2.5 py-1">
                    {ORDER_STATUS[order.status] ?? order.status}
                  </span>
                  <Link href={`/orders/${order.id}`} className="text-xs text-orange-400 hover:underline">
                    Details →
                  </Link>
                </div>
              </div>
            ))}
            <Link href="/track" className="block text-center text-sm text-white/40 hover:text-white/70 py-2">
              Track an order →
            </Link>
          </div>
        )}

        {tab === "security" && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <p className="text-sm text-white/50">Email: <strong className="text-white">{user.email}</strong></p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-4">Change password</h2>
              <form onSubmit={changePassword} className="space-y-3">
                {pwError && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400">
                    {pwError}
                  </div>
                )}
                {pwMsg && (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-2 text-sm text-green-400">
                    {pwMsg}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Current password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.current}
                    onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">New password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={pwForm.next}
                    onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1">Confirm new password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.confirm}
                    onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-orange-500 hover:bg-orange-400 px-5 py-2 text-sm font-semibold text-white transition-colors"
                >
                  Update password
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
