"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Star } from "lucide-react";

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

interface MediaItem {
  id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export default function EditProductPage({ params }: { params: { id: string } }) {
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
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mediaWorking, setMediaWorking] = useState<string | null>(null);

  function token() { return localStorage.getItem("access_token") ?? ""; }

  useEffect(() => {
    const t = token();
    if (!t) { router.push("/auth/login"); return; }

    Promise.all([
      fetch(`/api/v1/catalog/products/${params.id}`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
      fetch("/api/v1/catalog/categories", { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
      fetch("/api/v1/catalog/stores", { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
    ])
      .then(([product, cats, sts]) => {
        if (product.detail) { router.push("/seller/products"); return; }
        setForm({
          title: product.title ?? "",
          description: product.description ?? "",
          price: String(product.price ?? ""),
          stock: String(product.stock ?? 0),
          currency: product.currency ?? "MAD",
          store_id: product.store_id ?? "",
          category_id: product.category_id ?? "",
          status: product.status ?? "draft",
        });
        setMedia(Array.isArray(product.media) ? product.media : []);
        setCategories(Array.isArray(cats) ? cats : []);
        setStores(Array.isArray(sts) ? sts : []);
      })
      .catch(() => setError("Failed to load product"))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  async function handleSetPrimary(mediaId: string) {
    setMediaWorking(mediaId);
    try {
      const res = await fetch(`/api/v1/catalog/products/${params.id}/media/${mediaId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.ok) {
        setMedia((prev) => prev.map((m) => ({ ...m, is_primary: m.id === mediaId })));
      }
    } catch {
      setError("Failed to update primary image");
    } finally {
      setMediaWorking(null);
    }
  }

  async function handleDeleteMedia(mediaId: string) {
    setMediaWorking(mediaId);
    try {
      await fetch(`/api/v1/catalog/products/${params.id}/media/${mediaId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token()}` },
      });
      setMedia((prev) => prev.filter((m) => m.id !== mediaId));
    } catch {
      setError("Failed to delete image");
    } finally {
      setMediaWorking(null);
    }
  }

  async function handleUploadMore() {
    if (!newImage) return;
    setMediaWorking("upload");
    const fd = new FormData();
    fd.append("file", newImage);
    try {
      const res = await fetch(`/api/v1/catalog/products/${params.id}/media?is_primary=${media.length === 0}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      if (res.ok) {
        const added: MediaItem = await res.json();
        setMedia((prev) => [...prev, added]);
        setNewImage(null);
      } else {
        setError("Upload failed");
      }
    } catch {
      setError("Upload failed");
    } finally {
      setMediaWorking(null);
    }
  }

  const allCategories: Category[] = categories.flatMap((c) => [c, ...(c.children ?? [])]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = {
        title: form.title,
        description: form.description,
        price: parseFloat(form.price),
        stock: parseInt(form.stock, 10),
        store_id: form.store_id || undefined,
        category_id: form.category_id || undefined,
        status: form.status,
      };

      const res = await fetch(`/api/v1/catalog/products/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Update failed");
      }

      router.push("/seller/products");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-white/30";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Edit product</h1>
          <button
            onClick={() => router.push("/seller/products")}
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              className={`${inputCls} resize-none`}
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
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Stock</label>
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
                <option value="">No store</option>
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
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Image management */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Product images</label>
            {media.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-3">
                {media.map((m) => (
                  <div key={m.id} className={`relative group rounded-xl overflow-hidden border-2 ${m.is_primary ? "border-orange-400" : "border-white/10"}`}>
                    <img src={m.url} alt="Product" className="w-full aspect-square object-cover" />
                    {m.is_primary && (
                      <span className="absolute top-1 left-1 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">PRIMARY</span>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {!m.is_primary && (
                        <button
                          type="button"
                          disabled={mediaWorking === m.id}
                          onClick={() => handleSetPrimary(m.id)}
                          className="p-1.5 rounded-lg bg-orange-500/80 hover:bg-orange-500 transition-colors"
                          title="Set as primary"
                        >
                          <Star className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={mediaWorking === m.id}
                        onClick={() => handleDeleteMedia(m.id)}
                        className="p-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 transition-colors"
                        title="Delete image"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 items-start">
              <label className="flex-1 flex flex-col items-center justify-center h-20 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-orange-400/50 hover:bg-white/5 transition-colors">
                <span className="text-sm text-white/50">
                  {newImage ? `${newImage.name} (${(newImage.size / 1024).toFixed(0)} KB)` : "+ Add image"}
                </span>
                <span className="text-xs text-white/30 mt-0.5">JPEG, PNG or WebP</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setNewImage(e.target.files?.[0] ?? null)}
                />
              </label>
              {newImage && (
                <button
                  type="button"
                  disabled={mediaWorking === "upload"}
                  onClick={handleUploadMore}
                  className="h-20 px-4 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {mediaWorking === "upload" ? "Uploading..." : "Upload"}
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !form.title || !form.price}
            className="w-full rounded-xl bg-orange-500 hover:bg-orange-400 py-3 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </main>
  );
}
