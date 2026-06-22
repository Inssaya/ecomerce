"use client";

import Link from "next/link";
import { ShoppingCart, Search, Menu, X } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/hooks/useCart";
import { CartSidebar } from "./CartSidebar";

export function Navbar() {
  const { count } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          {/* Logo */}
          <Link href="/" className="text-xl font-extrabold text-primary shrink-0">
            Ecomerce
          </Link>

          {/* Search */}
          <form
            action="/search"
            method="GET"
            className="hidden sm:flex flex-1 max-w-xl items-center bg-muted rounded-xl px-4 py-2 gap-2"
          >
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              name="q"
              type="search"
              placeholder="Rechercher des produits..."
              className="bg-transparent flex-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            {/* Mobile search */}
            <Link
              href="/search"
              className="sm:hidden p-2 rounded-xl hover:bg-muted transition-colors"
            >
              <Search className="w-5 h-5" />
            </Link>

            {/* Cart */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative p-2 rounded-xl hover:bg-muted transition-colors"
              aria-label="Ouvrir le panier"
            >
              <ShoppingCart className="w-5 h-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>

            {/* Nav links desktop */}
            <nav className="hidden md:flex items-center gap-1">
              <NavLink href="/products">Produits</NavLink>
              <NavLink href="/categories">Catégories</NavLink>
              <NavLink href="/auth/login">Connexion</NavLink>
              <Link
                href="/auth/register"
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-xl hover:opacity-90 transition-opacity"
              >
                S&apos;inscrire
              </Link>
            </nav>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-xl hover:bg-muted transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-white px-4 py-4 space-y-2">
            <MobileLink href="/products" onClick={() => setMobileOpen(false)}>Produits</MobileLink>
            <MobileLink href="/categories" onClick={() => setMobileOpen(false)}>Catégories</MobileLink>
            <MobileLink href="/auth/login" onClick={() => setMobileOpen(false)}>Connexion</MobileLink>
            <Link
              href="/auth/register"
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-xl"
            >
              S&apos;inscrire
            </Link>
          </div>
        )}
      </header>

      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
    >
      {children}
    </Link>
  );
}

function MobileLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-3 py-2 text-sm font-medium rounded-xl hover:bg-muted transition-colors"
    >
      {children}
    </Link>
  );
}
