"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Profile {
  store_name: string;
  description: string | null;
  coverage_zones: string[];
  status: string;
  commission_rate: number;
  payout_balance: number;
}

export default function SellerProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ store_name: "", description: "" });
  const [zoneInput, setZoneInput] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/auth/login"; return; }

    fetch("/api/v1/seller/profile/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((p) => {
        if (p.detail) { window.location.href = "/seller/onboarding"; return; }
        setProfile(p);
        setForm({ store_name: p.store_name, description: p.description ?? "" });
        setZones(p.coverage_zones ?? []);
      })
      .catch(() => setError("Failed to load profile"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch("/api/v1/seller/profile/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, coverage_zones: zones }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Update failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function addZone() {
    const z = zoneInput.trim();
    if (z && !zones.includes(z)) {
      setZones((prev) => [...prev, z]);
      setZoneInput("");
    }
  }

  const inputCls =
    "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30";

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    verified: "bg-green-500/20 text-green-400",
    suspended: "bg-red-500/20 text-red-400",
  };

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Edit profile</h1>
          <Link
            href="/seller/dashboard"
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5 transition-colors"
          >
            ← Dashboard
          </Link>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Store status</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[profile.status] ?? "bg-white/10 text-white/50"}`}>
              {profile.status}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Commission rate</p>
            <p className="text-sm font-semibold text-white">{(profile.commission_rate * 100).toFixed(0)}%</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Payout balance</p>
            <p className="text-sm font-semibold text-orange-400">{profile.payout_balance.toFixed(2)} MAD</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Store name *</label>
            <input
              required
              value={form.store_name}
              onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              className={`${inputCls} resize-none`}
              placeholder="Describe your store..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Coverage zones</label>
            <div className="flex gap-2 mb-2">
              <input
                value={zoneInput}
                onChange={(e) => setZoneInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addZone())}
                placeholder="e.g. Casablanca"
                className={inputCls}
              />
              <button
                type="button"
                onClick={addZone}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 transition-colors"
              >
                Add
              </button>
            </div>
            {zones.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {zones.map((z) => (
                  <span
                    key={z}
                    className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400"
                  >
                    {z}
                    <button
                      type="button"
                      onClick={() => setZones((prev) => prev.filter((x) => x !== z))}
                      className="text-orange-400/60 hover:text-orange-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-orange-500 hover:bg-orange-400 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            {saved && <p className="text-sm text-green-400">Saved!</p>}
          </div>
        </form>
      </div>
    </main>
  );
}
