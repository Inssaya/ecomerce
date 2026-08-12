"use client";

/**
 * Orders · Commissions · Messages.
 *
 * Sections of one door, not three doors: they are three things a customer
 * sent the workshop, and the owner works them as one queue. They are real
 * routes so each is linkable, they just are not nav items.
 */
import { useRouter } from "next/navigation";

import { Segmented } from "../ui/primitives";

const SECTIONS = [
  { value: "orders" as const, label: "Orders" },
  { value: "commissions" as const, label: "Commissions" },
  { value: "messages" as const, label: "Messages" },
];

const PATHS: Record<string, string> = {
  orders: "/admin/orders",
  commissions: "/admin/orders/commissions",
  messages: "/admin/orders/messages",
};

export function SectionSwitch({ current, unread }: { current: "orders" | "commissions" | "messages"; unread?: number }) {
  const router = useRouter();
  const options = SECTIONS.map((section) =>
    section.value === "messages" && unread ? { ...section, label: `Messages (${unread})` } : section,
  );

  return (
    <Segmented
      options={options}
      value={current}
      onChange={(next) => next !== current && router.push(PATHS[next])}
      ariaLabel="Section"
    />
  );
}
