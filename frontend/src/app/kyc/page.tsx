"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DOC_TYPES = [
  { value: "national_id", label: "National ID Card (CIN)" },
  { value: "passport", label: "Passport" },
  { value: "residence_permit", label: "Residence permit" },
];

export default function KycPage() {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", doc_type: "national_id" });
  const [selfie, setSelfie] = useState<File | null>(null);
  const [idCard, setIdCard] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function previewName(file: File | null) {
    if (!file) return null;
    return `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selfie || !idCard) { setError("Both files are required"); return; }
    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("access_token");
      if (!token) { router.push("/auth/login"); return; }

      const fd = new FormData();
      fd.append("full_name", form.full_name);
      fd.append("doc_type", form.doc_type);
      fd.append("selfie", selfie);
      fd.append("id_card", idCard);

      const res = await fetch("/api/v1/auth/kyc/submit", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Submission failed");
      }

      router.push("/account?tab=kyc&submitted=1");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30";

  return (
    <main className="min-h-screen bg-gray-950 py-12 px-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Identity Verification (KYC)</h1>
          <p className="text-white/50 mt-1 text-sm">
            Your documents are encrypted and strictly confidential.
          </p>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 mb-6 text-sm text-blue-400">
          <strong>Required documents:</strong>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            <li>A clear selfie of your face</li>
            <li>A legible photo of your ID document (front side)</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              Full name (as it appears on your document) *
            </label>
            <input
              required
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className={inputCls}
              placeholder="First Last"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              Document type *
            </label>
            <select
              value={form.doc_type}
              onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
              className={inputCls}
            >
              {DOC_TYPES.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              Selfie (photo of your face) *
            </label>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-orange-400/50 hover:bg-white/5 transition-colors">
              <span className="text-sm text-white/50">
                {previewName(selfie) ?? "Click to choose a file"}
              </span>
              <span className="text-xs text-white/30 mt-1">JPEG, PNG or WebP — max 10 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => setSelfie(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              ID document photo *
            </label>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-orange-400/50 hover:bg-white/5 transition-colors">
              <span className="text-sm text-white/50">
                {previewName(idCard) ?? "Click to choose a file"}
              </span>
              <span className="text-xs text-white/30 mt-1">JPEG, PNG or WebP — max 10 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => setIdCard(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <p className="text-xs text-white/30 leading-relaxed">
            By submitting these documents, you consent to the processing of your personal data
            in accordance with Moroccan law 09-08. Your documents are encrypted and accessible
            only to authorized administrators.
          </p>

          <button
            type="submit"
            disabled={loading || !selfie || !idCard || !form.full_name}
            className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40 transition-colors"
          >
            {loading ? "Submitting..." : "Submit documents"}
          </button>
        </form>
      </div>
    </main>
  );
}
