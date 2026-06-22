import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Ecomerce — Multi-Vendor Marketplace",
    template: "%s | Ecomerce",
  },
  description:
    "Découvrez des milliers de produits sélectionnés par des vendeurs vérifiés. Paiement à la livraison.",
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
      <body className={inter.className}>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}
