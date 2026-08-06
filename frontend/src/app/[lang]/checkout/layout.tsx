import type { Metadata } from "next";
import type { ReactNode } from "react";

/** A form with a name, a phone number and an address in it. */
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
