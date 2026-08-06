import type { Metadata } from "next";
import type { ReactNode } from "react";

/** A workbench, not a shop window — see `workshop/layout.tsx`. */
export const metadata: Metadata = {
  title: "Backgrounds",
  robots: { index: false, follow: false, nocache: true },
};

export default function AmbientLayout({ children }: { children: ReactNode }) {
  return children;
}
