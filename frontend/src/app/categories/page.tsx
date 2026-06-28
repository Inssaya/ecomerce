import type { Metadata } from "next";
import { getCategories } from "@/lib/api";
import { CategoryCard } from "@/components/CategoryCard";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  let categories = [];
  try {
    categories = await getCategories();
  } catch {
    // Catalog service may not be running
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-2">All Categories</h1>
        <p className="text-white/40 mb-8">Browse our selection by category</p>

        {categories.length > 0 ? (
          <div className="space-y-10">
            {categories.map((cat) => (
              <div key={cat.id}>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
                  <span>{cat.icon ?? "🛍️"}</span>
                  {cat.name}
                </h2>
                {cat.children && cat.children.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {cat.children.map((child) => (
                      <CategoryCard key={child.id} category={child} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    <CategoryCard category={cat} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
