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
    return { title: cat.name, description: `Découvrez les produits dans la catégorie ${cat.name}` };
  } catch {
    return { title: "Catégorie" };
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/categories" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Catégories
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{category.name}</span>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <span className="text-3xl">{category.icon ?? "🛍️"}</span>
        <h1 className="text-3xl font-bold">{category.name}</h1>
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
            <p className="text-sm text-muted-foreground mb-4">
              {data.total} produit{data.total !== 1 ? "s" : ""}
            </p>
          )}

          {data && data.items.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              Aucun produit dans cette catégorie pour l&apos;instant.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
