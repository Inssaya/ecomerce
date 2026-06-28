"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface Product {
  id: string;
  title: string;
  price: number;
  currency: string;
  stock_qty: number;
  status: string;
  primary_image: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  draft: "bg-white/10 text-white/50",
  archived: "bg-red-500/20 text-red-400",
};

const PAGE_SIZE = 20;

export default function SellerProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) { window.location.href = "/auth/login"; return; }
    setLoading(true);

    fetch("/api/v1/seller/profile/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((profile) => {
        if (profile.detail) { window.location.href = "/seller/onboarding"; return; }
        return fetch(`/api/v1/catalog/products?seller_id=${profile.user_id}&size=${PAGE_SIZE}&page=${page}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data) {
          setProducts(data.items ?? []);
          setTotal(data.total ?? 0);
        }
      })
      .catch(() => setError("Failed to load products"))
      .finally(() => setLoading(false));
  }, [page]);

  async function toggleStatus(product: Product) {
    const token = localStorage.getItem("access_token");
    const newStatus = product.status === "active" ? "draft" : "active";
    try {
      await fetch(`/api/v1/catalog/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: newStatus } : p))
      );
    } catch {
      setError("Failed to update product");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">My products</h1>
            <p className="text-sm text-white/40 mt-0.5">{total} product{total !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/seller/dashboard"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 hover:bg-white/5 transition-colors"
            >
              ← Dashboard
            </Link>
            <Link
              href="/products/new"
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 transition-colors"
            >
              + New product
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {products.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
            <p className="text-white/40 mb-4">No products yet</p>
            <Link href="/products/new" className="text-orange-400 hover:underline text-sm">
              Create your first product →
            </Link>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide">Product</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden sm:table-cell">Price</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden md:table-cell">Stock</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {product.primary_image ? (
                          <img
                            src={product.primary_image}
                            alt={product.title}
                            className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-white/5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate max-w-[180px]">
                            {product.title}
                          </p>
                          <p className="text-xs text-white/30 sm:hidden">
                            {formatPrice(product.price, product.currency)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <span className="text-sm font-medium text-orange-400">
                        {formatPrice(product.price, product.currency)}
                      </span>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className={`text-sm ${product.stock_qty === 0 ? "text-red-400" : "text-white/70"}`}>
                        {product.stock_qty}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[product.status] ?? "bg-white/10 text-white/50"}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleStatus(product)}
                          className="text-xs text-white/50 hover:text-white transition-colors"
                        >
                          {product.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                        <Link
                          href={`/products/${product.id}/edit`}
                          className="text-xs text-white/50 hover:text-white transition-colors"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/products/${product.id}`}
                          className="text-xs text-orange-400 hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
                <p className="text-xs text-white/40">
                  Page {page} of {Math.ceil(total / PAGE_SIZE)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 1}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= Math.ceil(total / PAGE_SIZE)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 hover:bg-white/5 disabled:opacity-30 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
