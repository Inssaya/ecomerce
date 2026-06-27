"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";

const STORES = [
  {
    slug: "clothes",
    name: "Fashion & Clothes",
    tagline: "Wear what you feel",
    gradient: "from-amber-500 via-orange-600 to-red-700",
    glow: "rgba(251,146,60,0.5)",
    icon: "👗",
    whatsapp: true,
    features: ["Custom prints", "All sizes", "Premium fabric"],
  },
  {
    slug: "3dprint",
    name: "3D Printing",
    tagline: "Turn ideas into reality",
    gradient: "from-cyan-500 via-blue-600 to-violet-700",
    glow: "rgba(6,182,212,0.5)",
    icon: "🖨️",
    whatsapp: true,
    features: ["Custom objects", "PLA & Resin", "Fast delivery"],
  },
  {
    slug: "electronics",
    name: "Electronics",
    tagline: "Power your life",
    gradient: "from-emerald-500 via-teal-600 to-cyan-700",
    glow: "rgba(16,185,129,0.5)",
    icon: "⚡",
    whatsapp: false,
    features: ["Latest tech", "Warranty", "Best prices"],
  },
  {
    slug: "glasses",
    name: "Eyewear",
    tagline: "See the world in style",
    gradient: "from-violet-500 via-purple-600 to-pink-700",
    glow: "rgba(139,92,246,0.5)",
    icon: "🕶️",
    whatsapp: false,
    features: ["UV protection", "Designer frames", "Prescription ready"],
  },
];

function StoreCard({ store, index }: { store: (typeof STORES)[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(60px)",
        transitionDelay: `${index * 120}ms`,
      }}
    >
      <Link href={`/store/${store.slug}`} className="group block h-full">
        <div
          className="relative h-80 rounded-3xl overflow-hidden cursor-pointer"
          style={{ boxShadow: `0 0 0 0 ${store.glow}`, transition: "box-shadow 0.4s ease" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 60px 10px ${store.glow}`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 0 ${store.glow}`;
          }}
        >
          {/* Background gradient */}
          <div className={`absolute inset-0 bg-gradient-to-br ${store.gradient} opacity-80 group-hover:opacity-100 transition-opacity duration-300`} />

          {/* Animated shine overlay */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(255,255,255,0.05) 100%)",
            }}
          />

          {/* Content */}
          <div className="relative z-10 h-full flex flex-col justify-between p-7">
            <div>
              <span className="text-5xl block mb-3">{store.icon}</span>
              <h3 className="text-2xl font-black text-white leading-tight">{store.name}</h3>
              <p className="text-white/70 text-sm mt-1 font-light">{store.tagline}</p>
            </div>

            <div>
              <ul className="space-y-1 mb-5">
                {store.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-white/80 text-xs">
                    <span className="w-1 h-1 rounded-full bg-white/60 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between">
                <span className="text-white text-sm font-semibold group-hover:translate-x-1 transition-transform duration-200 inline-flex items-center gap-1">
                  Shop now →
                </span>
                {store.whatsapp && (
                  <span className="text-xs bg-white/20 text-white rounded-full px-2.5 py-1">
                    Custom orders via WhatsApp
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

export function StoreGrid() {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <div className="text-center mb-16">
        <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
          What are you looking for?
        </h2>
        <p className="text-white/50 text-lg">
          Four worlds, one address — cash on delivery, always.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {STORES.map((store, i) => (
          <StoreCard key={store.slug} store={store} index={i} />
        ))}
      </div>
    </section>
  );
}
