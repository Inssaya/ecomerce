"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  children?: Category[];
}

interface Store {
  id: string;
  name: string;
  slug: string;
}

export default function NewProductPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    stock: "0",
    currency: "MAD",
    store_id: "",
    category_id: "",
    status: "draft",
  });
  const [image, setImage] = useState<File | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { router.push("/auth/login"); return; }

    Promise.all([
      fetch("/api/v1/catalog/categories", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/v1/catalog/stores", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([cats, sts]) => {
        setCategories(Array.isArray(cats) ? cats : []);
        setStores(Array.isArray(sts) ? sts : []);
      })
      .catch(() => {});
  }, []);

  const allCategories: Category[] = categories.flatMap((c) => [c, ...(c.children ?? [])]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const token = localStorage.getItem("access_token");

    try {
      const payload = {
        title: form.title,
        description: form.description,
        price: parseFloat(form.price),
        stock: parseInt(form.stock, 10),
        currency: form.currency,
        store_id: form.store_id || undefined,
        category_id: form.category_id || undefined,
        status: form.status,
      };

      const res = await fetch("/api/v1/catalog/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Failed to create product");
      }

      const product = await res.json();

      if (image) {
        const fd = new FormData();
        fd.append("file", image);
        await fetch(`/api/v1/catalog/products/${product.id}/media?is_primary=true`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        }).catch(() => {});
      }

      router.push(`/seller/products`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30";

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">New product</h1>
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5 transition-colors"
          >
            ← Back
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={inputCls}
              placeholder="Product name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              className={`${inputCls} resize-none`}
              placeholder="Describe the product..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Price (MAD) *</label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className={inputCls}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Stock *</label>
              <input
                required
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>

          {stores.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Store</label>
              <select
                value={form.store_id}
                onChange={(e) => setForm((f) => ({ ...f, store_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Select a store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {allCategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Category</label>
              <select
                value={form.category_id}
                onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">No category</option>
                {allCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon ? `${c.icon} ` : ""}{c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className={inputCls}
            >
              <option value="draft">Draft</option>
              <option value="active">Active (visible to buyers)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Product image</label>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-orange-400/50 hover:bg-white/5 transition-colors">
              <span className="text-sm text-white/50">
                {image ? `${image.name} (${(image.size / 1024).toFixed(0)} KB)` : "Click to upload image"}
              </span>
              <span className="text-xs text-white/30 mt-1">JPEG, PNG or WebP</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !form.title || !form.price}
            className="w-full rounded-xl bg-orange-500 hover:bg-orange-400 py-3 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
          >
            {loading ? "Creating..." : "Create product"}
          </button>
        </form>
      </div>
    </main>
  );
}
