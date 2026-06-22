import Link from "next/link";
import type { Category } from "@/types";

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex flex-col items-center gap-3 p-5 bg-white rounded-2xl border border-border hover:border-primary/30 hover:shadow-md transition-all duration-200 text-center"
    >
      <span className="text-3xl">{category.icon ?? "🛍️"}</span>
      <span className="text-sm font-medium group-hover:text-primary transition-colors">
        {category.name}
      </span>
    </Link>
  );
}
