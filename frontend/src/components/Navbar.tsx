"use client";

import Link from "next/link";
import { ShoppingCart, Search, Menu, X, User } from "lucide-react";
import { useState, useEffect } from "react";
import { useCart } from "@/hooks/useCart";
import { CartSidebar } from "./CartSidebar";
import { useLang } from "@/contexts/LanguageContext";

const STORES = [
  { slug: "clothes", name: "Fashion" },
  { slug: "3dprint", name: "3D Print" },
  { slug: "electronics", name: "Electronics" },
  { slug: "glasses", name: "Eyewear" },
];

export function Navbar() {
  const { count } = useCart();
  const { lang, toggle: toggleLang } = useLang();
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("access_token"));
    const handler = () => setIsLoggedIn(!!localStorage.getItem("access_token"));
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          {/* Logo */}
          <Link
            href="/"
            className="text-xl font-black shrink-0"
            style={{
              background: "linear-gradient(90deg, #ff6b35, #f7c59f, #7c3aed)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            MoStyle
          </Link>

          {/* Search */}
          <form
            action="/search"
            method="GET"
            className="hidden sm:flex flex-1 max-w-lg items-center bg-white/10 rounded-xl px-4 py-2 gap-2 focus-within:bg-white/15 transition-colors"
          >
            <Search className="w-4 h-4 text-white/40 shrink-0" />
            <input
              name="q"
              type="search"
              placeholder="Search products..."
              className="bg-transparent flex-1 text-sm outline-none placeholder:text-white/30 text-white"
            />
          </form>

          <div className="ml-auto flex items-center gap-1">
            {/* Mobile search */}
            <Link
              href="/search"
              className="sm:hidden p-2 rounded-xl hover:bg-white/10 transition-colors text-white/70"
            >
              <Search className="w-5 h-5" />
            </Link>

            {/* Stores dropdown desktop */}
            <div className="hidden md:block relative">
              <button
                onMouseEnter={() => setStoresOpen(true)}
                onMouseLeave={() => setStoresOpen(false)}
                className="px-3 py-2 text-sm text-white/60 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              >
                Stores ▾
              </button>
              {storesOpen && (
                <div
                  onMouseEnter={() => setStoresOpen(true)}
                  onMouseLeave={() => setStoresOpen(false)}
                  className="absolute top-full left-0 mt-1 bg-gray-900 border border-white/10 rounded-xl shadow-2xl py-2 w-44 z-50"
                >
                  {STORES.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/store/${s.slug}`}
                      className="block px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link href="/track" className="hidden md:block px-3 py-2 text-sm text-white/60 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
              Track
            </Link>

            {/* Cart */}
            <button
              onClick={() => setCartOpen(true)}
              className="relative p-2 rounded-xl hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              aria-label="Open cart"
            >
              <ShoppingCart className="w-5 h-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>

            {/* Account */}
            {isLoggedIn ? (
              <Link
                href="/account"
                className="hidden md:flex items-center gap-1.5 px-3 py-2 text-sm text-white/60 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              >
                <User className="w-4 h-4" />
                Account
              </Link>
            ) : (
              <div className="hidden md:flex items-center gap-1">
                <Link
                  href="/auth/login"
                  className="px-3 py-2 text-sm text-white/60 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/register"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Sign up
                </Link>
              </div>
            )}

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white text-xs font-bold tracking-wider"
              aria-label="Toggle language"
              title={lang === "en" ? "Switch to Arabic" : "Switch to English"}
            >
              {lang === "en" ? "ع" : "EN"}
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-xl hover:bg-white/10 transition-colors text-white/70"
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-black/90 px-4 py-4 space-y-1">
            <p className="text-xs text-white/30 uppercase tracking-widest px-3 py-2">Stores</p>
            {STORES.map((s) => (
              <MobileLink key={s.slug} href={`/store/${s.slug}`} onClick={() => setMobileOpen(false)}>
                {s.name}
              </MobileLink>
            ))}
            <div className="h-px bg-white/10 my-2" />
            <MobileLink href="/track" onClick={() => setMobileOpen(false)}>Track Order</MobileLink>
            {isLoggedIn ? (
              <MobileLink href="/account" onClick={() => setMobileOpen(false)}>My Account</MobileLink>
            ) : (
              <>
                <MobileLink href="/auth/login" onClick={() => setMobileOpen(false)}>Sign In</MobileLink>
                <Link
                  href="/auth/register"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-center px-4 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl mt-2"
                >
                  Create Account
                </Link>
              </>
            )}
          </div>
        )}
      </header>

      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
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
      className="block px-3 py-2 text-sm font-medium text-white/70 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
    >
      {children}
    </Link>
  );
}
