import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Someone's own request and the price we sent them. */
export const metadata: Metadata = {
  title: "Your request",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
