"use client";

/**
 * Pieces · Categories · Customers · Feed.
 *
 * Everything administrative behind one door, one section at a time. This is
 * the move that keeps the nav at four items no matter how much the console
 * learns to do.
 */
import { useRouter } from "next/navigation";

import { Segmented } from "../ui/primitives";

const SECTIONS = [
  { value: "pieces" as const, label: "Pieces" },
  { value: "categories" as const, label: "Categories" },
  { value: "customers" as const, label: "Customers" },
  { value: "feed" as const, label: "Feed" },
];

const PATHS: Record<string, string> = {
  pieces: "/admin/manage",
  categories: "/admin/manage/categories",
  customers: "/admin/manage/customers",
  feed: "/admin/manage/feed",
};

export function ManageSwitch({ current }: { current: "pieces" | "categories" | "customers" | "feed" }) {
  const router = useRouter();
  return (
    <Segmented
      options={SECTIONS}
      value={current}
      onChange={(next) => next !== current && router.push(PATHS[next])}
      ariaLabel="Manage section"
    />
  );
}
