import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Ecomerce — Multi-Vendor Marketplace",
    template: "%s | Ecomerce",
  },
  description:
    "Discover thousands of products from verified sellers. Fast delivery, secure orders, COD available.",
  openGraph: {
    type: "website",
    locale: "fr_MA",
    siteName: "Ecomerce",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
