import type { Metadata } from "next";
import { getProducts, getCategories, getLabels } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";

export const metadata: Metadata = { title: "All Products" };

interface PageProps {
  searchParams: { category_id?: string; label_ids?: string | string[]; page?: string; sort_by?: string };
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const page = Number(searchParams.page ?? 1);
  const labelIds = searchParams.label_ids
    ? Array.isArray(searchParams.label_ids)
      ? searchParams.label_ids
      : [searchParams.label_ids]
    : [];

  const [productsResult, categoriesResult, labelsResult] = await Promise.allSettled([
    getProducts({
      category_id: searchParams.category_id,
      label_ids: labelIds,
      page,
      size: 24,
      sort_by: searchParams.sort_by ?? "created_at",
      status: "active",
    }),
    getCategories(),
    getLabels(),
  ]);

  const data = productsResult.status === "fulfilled" ? productsResult.value : null;
  const categories = categoriesResult.status === "fulfilled" ? categoriesResult.value : [];
  const labels = labelsResult.status === "fulfilled" ? labelsResult.value : [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold mb-8">All Products</h1>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-64 shrink-0">
            <ProductFilters
              categories={categories}
              labels={labels}
              selectedCategory={searchParams.category_id}
              selectedLabels={labelIds}
            />
          </aside>

          <div className="flex-1">
            {data && (
              <p className="text-sm text-white/40 mb-4">
                {data.total} product{data.total !== 1 ? "s" : ""} found
              </p>
            )}

            {data && data.items.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {data.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                <Pagination page={page} pages={data.pages} searchParams={searchParams} />
              </>
            ) : (
              <div className="text-center py-20 text-white/40">
                No products found. Try adjusting your filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  pages,
  searchParams,
}: {
  page: number;
  pages: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (pages <= 1) return null;
  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (k === "page") return;
      if (Array.isArray(v)) v.forEach((val) => params.append(k, val));
      else if (v) params.set(k, v);
    });
    params.set("page", String(p));
    return `/products?${params}`;
  };

  return (
    <div className="flex items-center justify-center gap-2 mt-10">
      {page > 1 && (
        <a href={makeHref(page - 1)} className="px-4 py-2 border border-white/10 rounded-xl text-sm text-white/60 hover:bg-white/5">
          ← Previous
        </a>
      )}
      <span className="text-sm text-white/40">
        Page {page} / {pages}
      </span>
      {page < pages && (
        <a href={makeHref(page + 1)} className="px-4 py-2 border border-white/10 rounded-xl text-sm text-white/60 hover:bg-white/5">
          Next →
        </a>
      )}
    </div>
  );
}
