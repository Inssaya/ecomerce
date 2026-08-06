import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Reached by an unguessable token, which is what lets it work without a login — and exactly why it must never be listed. */
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
