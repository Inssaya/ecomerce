"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface User {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
}

interface KycDoc {
  id: string;
  doc_type: string;
  full_name: string;
  review_status: string;
  rejection_reason: string | null;
  submitted_at: string;
}

const KYC_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  submitted: { label: "En cours de révision", color: "bg-blue-100 text-blue-700" },
  under_review: { label: "Sous révision", color: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approuvé", color: "bg-green-100 text-green-700" },
  rejected: { label: "Rejeté", color: "bg-red-100 text-red-700" },
};

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [kyc, setKyc] = useState<KycDoc[]>([]);
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"profile" | "kyc" | "security">("profile");

  function authHeaders() {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/auth/login"; return; }
    Promise.all([
      fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/v1/auth/kyc/status", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([u, k]) => {
      setUser(u);
      setForm({ full_name: u.full_name ?? "", phone: u.phone ?? "" });
      setKyc(Array.isArray(k) ? k : []);
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
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Chargement...</p>
    </main>
  );

  const hasApprovedKyc = kyc.some(k => k.review_status === "approved");

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mon compte</h1>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Déconnexion
          </button>
        </div>

        <nav className="flex gap-1 bg-white rounded-xl shadow-sm p-1 mb-6 w-fit">
          {(["profile", "kyc", "security"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t ? "bg-orange-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t === "profile" ? "Profil" : t === "kyc" ? "Vérification" : "Sécurité"}
            </button>
          ))}
        </nav>

        {tab === "profile" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Informations personnelles</h2>
              <form onSubmit={saveProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
                  <input
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <input
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="+212..."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {saving ? "Enregistrement..." : "Sauvegarder"}
                  </button>
                  {saved && <p className="text-sm text-green-600">Sauvegardé!</p>}
                </div>
              </form>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Type de compte</p>
                <p className="text-sm text-gray-500 capitalize">{user.role.replace(/_/g, " ")}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                user.status === "active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}>
                {user.status}
              </span>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="font-medium text-gray-900 mb-3">Accès rapide</h3>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/orders" className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  Mes commandes
                </Link>
                <Link href="/track" className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                  Suivi colis
                </Link>
              </div>
            </div>
          </div>
        )}

        {tab === "kyc" && (
          <div className="space-y-4">
            {hasApprovedKyc ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                <p className="font-semibold text-green-800">Identité vérifiée</p>
                <p className="text-sm text-green-600 mt-1">
                  Votre compte est pleinement activé.
                </p>
              </div>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
                <p className="font-semibold text-orange-800">Vérification requise</p>
                <p className="text-sm text-orange-600 mt-1">
                  Soumettez vos documents pour activer toutes les fonctionnalités.
                </p>
                {kyc.length === 0 && (
                  <Link
                    href="/kyc"
                    className="mt-3 inline-block rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                  >
                    Soumettre les documents
                  </Link>
                )}
              </div>
            )}

            {kyc.map(doc => {
              const s = KYC_STATUS_LABELS[doc.review_status] ?? { label: doc.review_status, color: "bg-gray-100 text-gray-600" };
              return (
                <div key={doc.id} className="bg-white rounded-xl shadow-sm p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{doc.full_name}</p>
                      <p className="text-sm text-gray-500 capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Soumis le {new Date(doc.submitted_at).toLocaleDateString("fr-MA")}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                      {s.label}
                    </span>
                  </div>
                  {doc.rejection_reason && (
                    <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                      Raison: {doc.rejection_reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === "security" && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Sécurité</h2>
            <p className="text-sm text-gray-500 mb-4">Email: <strong>{user.email}</strong></p>
            <p className="text-sm text-gray-400">
              Pour changer votre mot de passe, contactez le support ou utilisez la fonctionnalité de réinitialisation.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
