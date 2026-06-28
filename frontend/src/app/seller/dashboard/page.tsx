"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Profile {
  store_name: string;
  status: string;
  commission_rate: number;
  payout_balance: number;
}

interface Analytics {
  total_orders: number;
  total_gross_mad: number;
  total_net_mad: number;
  total_commission_mad: number;
}

export default function SellerDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      window.location.href = "/auth/login";
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch("/api/v1/seller/profile/me", { headers }).then((r) => r.json()),
      fetch("/api/v1/seller/analytics/summary", { headers }).then((r) => r.json()),
    ])
      .then(([p, a]) => {
        if (p.detail) {
          window.location.href = "/seller/onboarding";
          return;
        }
        setProfile(p);
        setAnalytics(a);
      })
      .catch(() => setError("Failed to load data"));
  }, []);

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    verified: "bg-green-500/20 text-green-400",
    suspended: "bg-red-500/20 text-red-400",
  };

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">{profile.store_name}</h1>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[profile.status] ?? "bg-white/10 text-white/50"}`}>
              {profile.status}
            </span>
          </div>
          <Link
            href="/products/new"
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400"
          >
            + New product
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Orders", value: analytics?.total_orders ?? 0 },
            { label: "Revenue", value: `${(analytics?.total_gross_mad ?? 0).toFixed(2)} MAD` },
            { label: "Net earned", value: `${(analytics?.total_net_mad ?? 0).toFixed(2)} MAD` },
            { label: "Available balance", value: `${(profile.payout_balance ?? 0).toFixed(2)} MAD` },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <p className="text-xs text-white/40 uppercase tracking-wide mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Quick links</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { href: "/seller/products", label: "My products" },
              { href: "/seller/orders", label: "My orders" },
              { href: "/seller/earnings", label: "Earnings" },
              { href: "/seller/profile", label: "Edit profile" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm font-medium text-white/70 hover:bg-white/5 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/30">
            Platform commission: {(profile.commission_rate * 100).toFixed(0)}%
          </p>
        </div>
      </div>
    </main>
  );
}
