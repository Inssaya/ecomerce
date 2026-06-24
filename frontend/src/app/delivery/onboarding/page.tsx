"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeliveryOnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    kind: "individual" as "individual" | "company",
    company_name: "",
    vehicle_type: "",
    coverage_zones: [] as string[],
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const payload: any = {
        kind: form.kind,
        vehicle_type: form.vehicle_type || null,
        coverage_zones: form.coverage_zones,
      };
      if (form.kind === "company" && form.company_name) {
        payload.company_name = form.company_name;
      }
      const res = await fetch("/api/v1/delivery/agents/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Erreur");
      }
      router.push("/delivery");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Profil livreur</h1>
        <p className="text-gray-500 mb-8">Complétez votre profil pour commencer à livrer</p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de compte</label>
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as any }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="individual">Livreur individuel</option>
              <option value="company">Société de livraison</option>
            </select>
          </div>

          {form.kind === "company" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la société</label>
              <input
                value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de véhicule</label>
            <input
              value={form.vehicle_type}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
              placeholder="Moto, Voiture, Van..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zones de couverture</label>
            <div className="flex gap-2">
              <input
                value={zoneInput}
                onChange={(e) => setZoneInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addZone())}
                placeholder="Ex: Casablanca"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                  >
                    {z}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, coverage_zones: f.coverage_zones.filter((x) => x !== z) }))
                      }
                      className="text-blue-400 hover:text-blue-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Enregistrement..." : "Créer le profil"}
          </button>
        </form>
      </div>
    </main>
  );
}
