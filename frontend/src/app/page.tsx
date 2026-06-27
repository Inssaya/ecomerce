import Link from "next/link";
import { PortalHero } from "@/components/PortalHero";
import { StoreGrid } from "@/components/StoreGrid";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-black overflow-x-hidden">
      {/* Animated intro + hero */}
      <PortalHero />

      {/* Store grid */}
      <StoreGrid />

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-sm text-white/40">
        <p>© 2026 MoStyle · Morocco</p>
        <div className="flex justify-center gap-6 mt-3">
          <Link href="/track" className="hover:text-white/70 transition-colors">Track Order</Link>
          <Link href="/account" className="hover:text-white/70 transition-colors">My Account</Link>
          <Link href="/admin" className="hover:text-white/70 transition-colors">Admin</Link>
        </div>
      </footer>
    </div>
  );
}
