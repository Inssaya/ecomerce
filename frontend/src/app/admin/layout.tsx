import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import "./console.css";

import { AdminShell } from "./AdminShell";

/**
 * The console's own root.
 *
 * A sibling of `[lang]/layout.tsx`, not nested inside it — this owns its own
 * `<html>`/`<body>` because the real root layout is a passthrough. The owner
 * is one account and this screen is never bilingual, so none of the
 * storefront's Chrome, CartProvider, AmbientProvider, or Arabic font loads
 * here. Nor does the storefront's Tailwind theme — the console's palette and
 * type scale come entirely from `console.css`'s own custom properties.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--console-font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--console-font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--console-font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "M-Style — owner console",
  // Never listed, never followed. Sign-in is what protects it; this is about
  // it never appearing in a search result at all.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
