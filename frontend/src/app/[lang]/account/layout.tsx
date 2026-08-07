import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Account pages are reached from an email, never from a search.
 *
 * `noindex` matters more here than on the other private routes: the reset page
 * carries a working token in its query string, and an indexed URL is a token
 * in a search result.
 */
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false, nocache: true },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
