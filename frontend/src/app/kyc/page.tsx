"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DOC_TYPES = [
  { value: "national_id", label: "Carte Nationale d'Identité (CIN)" },
  { value: "passport", label: "Passeport" },
  { value: "residence_permit", label: "Titre de séjour" },
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
    if (!selfie || !idCard) { setError("Les deux fichiers sont requis"); return; }
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
        throw new Error(data.detail ?? "Erreur lors de la soumission");
      }

      router.push("/account?tab=kyc&submitted=1");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Vérification d&apos;identité (KYC)</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Conformément à la loi 09-08, vos données sont chiffrées et strictement confidentielles.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-6 text-sm text-blue-700">
          <strong>Documents nécessaires:</strong>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            <li>Un selfie clair de votre visage</li>
            <li>Une photo lisible de votre document d&apos;identité (recto)</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom complet (tel qu&apos;il figure sur le document) *
            </label>
            <input
              required
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Prénom Nom"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type de document *
            </label>
            <select
              value={form.doc_type}
              onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              {DOC_TYPES.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Selfie (photo de votre visage) *
            </label>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors">
              <span className="text-sm text-gray-500">
                {previewName(selfie) ?? "Cliquez pour choisir un fichier"}
              </span>
              <span className="text-xs text-gray-400 mt-1">JPEG, PNG ou WebP — max 10 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => setSelfie(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photo du document d&apos;identité *
            </label>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors">
              <span className="text-sm text-gray-500">
                {previewName(idCard) ?? "Cliquez pour choisir un fichier"}
              </span>
              <span className="text-xs text-gray-400 mt-1">JPEG, PNG ou WebP — max 10 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => setIdCard(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            En soumettant ces documents, vous consentez au traitement de vos données
            conformément à la loi marocaine 09-08 relative à la protection des personnes physiques.
            Vos documents sont chiffrés et accessibles uniquement aux administrateurs autorisés.
          </p>

          <button
            type="submit"
            disabled={loading || !selfie || !idCard || !form.full_name}
            className="w-full rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-40 transition-colors"
          >
            {loading ? "Envoi en cours..." : "Soumettre les documents"}
          </button>
        </form>
      </div>
    </main>
  );
}
