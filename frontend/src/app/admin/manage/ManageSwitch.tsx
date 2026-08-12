"use client";

/**
 * Products · Customers · Feed.
 *
 * Everything administrative behind one door, one section at a time. This is
 * the move that keeps the nav at four items no matter how much the console
 * learns to do.
 *
 * Categories left this list when it stopped being a page: the tree is built
 * inside Products, under Add. Products has already moved to `ConsoleHeader`
 * and its `pages` prop; this stays for the sections that have not yet.
 */
import { useRouter } from "next/navigation";

import { Segmented } from "../ui/primitives";

const SECTIONS = [
  { value: "pieces" as const, label: "Products" },
  { value: "customers" as const, label: "Customers" },
  { value: "feed" as const, label: "Feed" },
];

const PATHS: Record<string, string> = {
  pieces: "/admin/manage",
  customers: "/admin/manage/customers",
  feed: "/admin/manage/feed",
};

export function ManageSwitch({ current }: { current: "pieces" | "customers" | "feed" }) {
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
