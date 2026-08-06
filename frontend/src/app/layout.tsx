import type { ReactNode } from "react";

/** The language layout below owns <html>; this exists only because Next
 *  requires a root layout. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
