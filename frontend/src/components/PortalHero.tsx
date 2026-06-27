"use client";

import { useEffect, useRef, useState } from "react";

export function PortalHero() {
  const [phase, setPhase] = useState<"intro" | "tagline" | "done">("intro");
  const [shown, setShown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setShown(true);
    // Phase 1: logo burst — 0-2s
    timerRef.current = setTimeout(() => setPhase("tagline"), 2000);
    // Phase 2: tagline hold — 2-5s then reveal stores
    const t2 = setTimeout(() => setPhase("done"), 5000);
    return () => {
      clearTimeout(timerRef.current!);
      clearTimeout(t2);
    };
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, #ff6b35 0%, transparent 70%)",
            animation: "float1 8s ease-in-out infinite",
          }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
            animation: "float2 10s ease-in-out infinite",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10"
          style={{
            background: "radial-gradient(circle, #0ea5e9 0%, transparent 70%)",
            animation: "float3 12s ease-in-out infinite",
          }}
        />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-4">
        {/* Logo */}
        <div
          className="transition-all duration-1000"
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? "scale(1)" : "scale(0.5)",
          }}
        >
          <span
            className="text-7xl sm:text-9xl font-black tracking-tight"
            style={{
              background: "linear-gradient(135deg, #ff6b35 0%, #f7c59f 40%, #7c3aed 80%, #0ea5e9 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 60px rgba(255,107,53,0.4))",
            }}
          >
            MoStyle
          </span>
        </div>

        {/* Tagline */}
        <div
          className="mt-6 transition-all duration-1000 delay-500"
          style={{
            opacity: phase === "tagline" || phase === "done" ? 1 : 0,
            transform: phase === "tagline" || phase === "done" ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <p className="text-white/80 text-xl sm:text-2xl font-light tracking-widest uppercase">
            Your Style. Your World.
          </p>
          <p className="text-white/40 text-sm mt-2 tracking-wider">
            Fashion · 3D Print · Electronics · Eyewear
          </p>
        </div>

        {/* Scroll hint */}
        <div
          className="mt-16 transition-all duration-1000 delay-1000"
          style={{ opacity: phase === "done" ? 1 : 0 }}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-white/40 text-xs tracking-widest uppercase">Explore</span>
            <div className="w-px h-12 bg-gradient-to-b from-white/40 to-transparent animate-pulse" />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(60px, -40px) scale(1.1); }
          66% { transform: translate(-30px, 60px) scale(0.9); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40% { transform: translate(-50px, 30px) scale(1.05); }
          70% { transform: translate(40px, -50px) scale(0.95); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.15); }
        }
      `}</style>
    </section>
  );
}
