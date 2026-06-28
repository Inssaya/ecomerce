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
      const payload: Record<string, unknown> = {
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
        throw new Error(data.detail ?? "Something went wrong");
      }
      router.push("/delivery");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30";

  return (
    <main className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-3xl font-bold text-white mb-2">Driver profile</h1>
        <p className="text-white/50 mb-8">Complete your profile to start delivering</p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Account type</label>
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "individual" | "company" }))}
              className={inputCls}
            >
              <option value="individual">Individual driver</option>
              <option value="company">Delivery company</option>
            </select>
          </div>

          {form.kind === "company" && (
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Company name</label>
              <input
                value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Vehicle type</label>
            <input
              value={form.vehicle_type}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
              placeholder="Motorcycle, Car, Van..."
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Coverage zones</label>
            <div className="flex gap-2">
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
            {form.coverage_zones.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {form.coverage_zones.map((z) => (
                  <span
                    key={z}
                    className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400"
                  >
                    {z}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, coverage_zones: f.coverage_zones.filter((x) => x !== z) }))
                      }
                      className="text-orange-400/60 hover:text-orange-400"
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
            className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40 transition-colors"
          >
            {loading ? "Saving..." : "Create profile"}
          </button>
        </form>
      </div>
    </main>
  );
}
