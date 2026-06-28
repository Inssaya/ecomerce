import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { LanguageProvider } from "@/contexts/LanguageContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "MoStyle — Your Style, Delivered",
    template: "%s | MoStyle",
  },
  description:
    "Clothes, 3D printing, electronics, glasses & more. Delivered to your door. Cash on delivery.",
  openGraph: {
    type: "website",
    locale: "en_MA",
    siteName: "MoStyle",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <LanguageProvider>
          <Navbar />
          <AnalyticsTracker />
          <main>{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
