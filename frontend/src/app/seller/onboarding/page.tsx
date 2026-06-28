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
        throw new Error(data.detail ?? "Something went wrong");
      }
      router.push("/seller/dashboard");
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
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Create your store</h1>
          <p className="text-white/50 mt-1">A few details to get you selling</p>
        </div>

        <div className="flex gap-2 mb-8">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1.5 rounded-full ${s <= step ? "bg-orange-500" : "bg-white/10"}`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-white">Store information</h2>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Store name *
                </label>
                <input
                  type="text"
                  required
                  value={form.store_name}
                  onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
                  className={inputCls}
                  placeholder="My Awesome Store"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  className={`${inputCls} resize-none`}
                  placeholder="Describe your store..."
                />
              </div>
              <button
                onClick={() => form.store_name && setStep(2)}
                disabled={!form.store_name}
                className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40 transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <h2 className="text-lg font-semibold text-white">Coverage zones</h2>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  Cities / Regions you serve
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={zoneInput}
                    onChange={(e) => setZoneInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addZone())}
                    className={inputCls}
                    placeholder="e.g. Casablanca"
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
                          onClick={() => removeZone(z)}
                          className="text-orange-400/60 hover:text-orange-400"
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
                  className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-medium text-white/70 hover:bg-white/5 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40 transition-colors"
                >
                  {loading ? "Creating..." : "Create store"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
