import type { Metadata } from "next";
import { getCategory, getProducts, getLabels } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface PageProps {
  params: { slug: string };
  searchParams: { label_ids?: string | string[]; page?: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const cat = await getCategory(params.slug);
    return { title: cat.name, description: `Browse products in ${cat.name}` };
  } catch {
    return { title: "Category" };
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  let category;
  try {
    category = await getCategory(params.slug);
  } catch {
    notFound();
  }

  const labelIds = searchParams.label_ids
    ? Array.isArray(searchParams.label_ids)
      ? searchParams.label_ids
      : [searchParams.label_ids]
    : [];
  const page = Number(searchParams.page ?? 1);

  const [productsResult, labelsResult] = await Promise.allSettled([
    getProducts({
      category_id: category.id,
      label_ids: labelIds,
      page,
      size: 24,
      status: "active",
    }),
    getLabels(),
  ]);

  const data = productsResult.status === "fulfilled" ? productsResult.value : null;
  const labels = labelsResult.status === "fulfilled" ? labelsResult.value : [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 text-sm text-white/40 mb-6">
          <Link href="/categories" className="flex items-center gap-1 hover:text-white/70 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Categories
          </Link>
          <span>/</span>
          <span className="text-white font-medium">{category.name}</span>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">{category.icon ?? "🛍️"}</span>
          <h1 className="text-3xl font-bold text-white">{category.name}</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-64 shrink-0">
            <ProductFilters
              categories={category.children ?? []}
              labels={labels}
              selectedLabels={labelIds}
            />
          </aside>

          <div className="flex-1">
            {data && (
              <p className="text-sm text-white/40 mb-4">
                {data.total} product{data.total !== 1 ? "s" : ""}
              </p>
            )}

            {data && data.items.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {data.items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-white/40">
                No products in this category yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
