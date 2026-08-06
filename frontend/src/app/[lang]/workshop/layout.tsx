import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The control room is not a page of this shop.
 *
 * `robots.txt` only asks a crawler not to fetch it; this tells the ones that
 * fetch it anyway to keep it out of the index, which is the half that actually
 * removes a page from a search result. The sign-in is what protects it — this
 * is about it never being *listed*.
 */
export const metadata: Metadata = {
  title: "The workshop",
  robots: { index: false, follow: false, nocache: true },
};

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return children;
}
