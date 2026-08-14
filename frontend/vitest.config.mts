import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Tests for the parts of the storefront that decide something.
 *
 * Not for the layout — a snapshot of markup breaks on every honest change and
 * catches nothing. What is worth testing here is behaviour with a consequence:
 * that a button calls the endpoint it claims to, that a screen only offers the
 * moves the server will accept, and that the guards a shop depends on hold.
 *
 * jsdom rather than a real browser: none of it needs layout or paint, and a
 * suite that needs Chromium is a suite nobody runs.
 */
export default defineConfig({
  plugins: [react()],
  // The app's tsconfig says `jsx: preserve`, because Next does its own
  // transform at build time. esbuild honours that and then hands the runner
  // JSX it cannot execute, so the runner is told explicitly.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.tsx"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
