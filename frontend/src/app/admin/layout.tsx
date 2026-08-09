import type { Metadata } from "next";
import { Instrument_Serif, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import "@/app/globals.css";

import { AdminShell } from "./AdminShell";

/**
 * The control room's own root.
 *
 * A sibling of `[lang]/layout.tsx`, not nested inside it — this owns its own
 * `<html>`/`<body>` because the real root layout (`app/layout.tsx`) is just a
 * passthrough. The owner is one account and this screen is never bilingual,
 * so none of the storefront's Chrome, CartProvider, AmbientProvider, or
 * Arabic font loads here — carrying them would be dead weight on the one
 * screen that never needs them.
 */
const text = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-text",
  display: "swap",
});

const stamp = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-stamp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The workshop — control room",
  // Never listed, never followed. The sign-in is what protects it; this is
  // about it never appearing in a search result at all.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${text.variable} ${stamp.variable}`}>
      <body className={text.className}>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
