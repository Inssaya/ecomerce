"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { Category, Label } from "@/types";

interface Props {
  categories: Category[];
  labels: Label[];
  selectedCategory?: string;
  selectedLabels: string[];
}

export function ProductFilters({ categories, labels, selectedCategory, selectedLabels }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.push(`/products?${params}`);
    },
    [router, searchParams]
  );

  const toggleLabel = useCallback(
    (labelId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      const current = params.getAll("label_ids");
      params.delete("label_ids");
      if (current.includes(labelId)) {
        current.filter((id) => id !== labelId).forEach((id) => params.append("label_ids", id));
      } else {
        [...current, labelId].forEach((id) => params.append("label_ids", id));
      }
      router.push(`/products?${params}`);
    },
    [router, searchParams]
  );

  // Group labels by group
  const labelGroups = labels.reduce<Record<string, Label[]>>((acc, label) => {
    if (!acc[label.group]) acc[label.group] = [];
    acc[label.group].push(label);
    return acc;
  }, {});

  const groupNames: Record<string, string> = {
    style: "Style",
    material: "Matière",
    audience: "Audience",
    use_case: "Usage",
    season: "Saison",
    color: "Couleur",
    brand: "Marque",
    size: "Taille",
    other: "Autre",
  };

  return (
    <div className="space-y-6">
      {/* Categories */}
      <div>
        <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
          Catégories
        </h3>
        <div className="space-y-1">
          <button
            onClick={() => updateFilter("category_id", null)}
            className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              !selectedCategory ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
            }`}
          >
            Toutes les catégories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                selectedCategory === cat.id
                  ? updateFilter("category_id", null)
                  : updateFilter("category_id", cat.id)
              }
              className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedCategory === cat.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted"
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Labels by group */}
      {Object.entries(labelGroups).map(([group, groupLabels]) => (
        <div key={group}>
          <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
            {groupNames[group] ?? group}
          </h3>
          <div className="flex flex-wrap gap-2">
            {groupLabels.map((label) => (
              <button
                key={label.id}
                onClick={() => toggleLabel(label.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedLabels.includes(label.id)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white border-border hover:border-primary text-foreground"
                }`}
              >
                {label.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
