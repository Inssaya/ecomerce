"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SellerOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    store_name: "",
    description: "",
    coverage_zones: [] as string[],
    label_preferences: [] as string[],
  });
  const [zoneInput, setZoneInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function addZone() {
    const z = zoneInput.trim();
    if (z && !form.coverage_zones.includes(z)) {
      setForm((f) => ({ ...f, coverage_zones: [...f.coverage_zones, z] }));
      setZoneInput("");
    }
  }

  function removeZone(z: string) {
    setForm((f) => ({ ...f, coverage_zones: f.coverage_zones.filter((x) => x !== z) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch("/api/v1/seller/profile/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Erreur");
      }
      router.push("/seller/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Créez votre boutique</h1>
          <p className="text-gray-500 mt-1">Quelques informations pour démarrer la vente</p>
        </div>

        <div className="flex gap-2 mb-8">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-orange-500" : "bg-gray-200"}`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-8">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold">Informations de la boutique</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de la boutique *
                </label>
                <input
                  type="text"
                  required
                  value={form.store_name}
                  onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ma Super Boutique"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  placeholder="Décrivez votre boutique..."
                />
              </div>
              <button
                onClick={() => form.store_name && setStep(2)}
                disabled={!form.store_name}
                className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-40 transition-colors"
              >
                Continuer
              </button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <h2 className="text-lg font-semibold">Zones de couverture</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Villes/Régions desservies
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={zoneInput}
                    onChange={(e) => setZoneInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addZone())}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Ex: Casablanca"
                  />
                  <button
                    type="button"
                    onClick={addZone}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200"
                  >
                    Ajouter
                  </button>
                </div>
                {form.coverage_zones.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {form.coverage_zones.map((z) => (
                      <span
                        key={z}
                        className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700"
                      >
                        {z}
                        <button
                          type="button"
                          onClick={() => removeZone(z)}
                          className="text-orange-400 hover:text-orange-700"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Création..." : "Créer la boutique"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
