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
      .catch(() => setError("Impossible de charger les données"));
  }, []);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Chargement...</p>
      </main>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    verified: "bg-green-100 text-green-700",
    suspended: "bg-red-100 text-red-700",
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{profile.store_name}</h1>
            <span
              className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[profile.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {profile.status}
            </span>
          </div>
          <Link
            href="/products/new"
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            + Nouveau produit
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Commandes", value: analytics?.total_orders ?? 0 },
            { label: "Chiffre d'affaires", value: `${(analytics?.total_gross_mad ?? 0).toFixed(2)} MAD` },
            { label: "Net encaissé", value: `${(analytics?.total_net_mad ?? 0).toFixed(2)} MAD` },
            { label: "Solde disponible", value: `${(profile.payout_balance ?? 0).toFixed(2)} MAD` },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Liens rapides</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { href: "/seller/products", label: "Mes produits" },
              { href: "/seller/orders", label: "Mes commandes" },
              { href: "/seller/profile", label: "Modifier le profil" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-400">
            Commission plateforme: {(profile.commission_rate * 100).toFixed(0)}%
          </p>
        </div>
      </div>
    </main>
  );
}
