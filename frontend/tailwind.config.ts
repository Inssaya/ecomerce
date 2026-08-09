import type { Config } from "tailwindcss";

/** Soft, warm, certain — REBUILD-PLAN §8. */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "hsl(var(--cream))",
        surface: "hsl(var(--surface))",
        sand: "hsl(var(--sand))",
        clay: "hsl(var(--clay))",
        "clay-soft": "hsl(var(--clay-soft))",
        ink: "hsl(var(--ink))",
        "ink-soft": "hsl(var(--ink-soft))",
        "ink-mute": "hsl(var(--ink-mute))",
        good: "hsl(var(--good))",
        warn: "hsl(var(--warn))",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
      boxShadow: {
        // Diffuse and warm, never a hard edge.
        soft: "0 2px 14px -4px hsl(24 20% 40% / 0.10)",
        lift: "0 12px 36px -12px hsl(24 20% 30% / 0.18)",
      },
      transitionTimingFunction: {
        // Slow and gentle: nothing snaps.
        gentle: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
      transitionDuration: {
        DEFAULT: "280ms",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        rise: "rise 400ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
        fade: "fade 300ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
