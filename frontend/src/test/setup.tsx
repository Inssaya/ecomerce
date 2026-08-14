import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has neither, and the shelf and the piece page both use them to decide
// when a card has really been seen.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

vi.stubGlobal("IntersectionObserver", NoopObserver);
vi.stubGlobal("ResizeObserver", NoopObserver);

// `next/navigation` needs a router that exists. Tests that care about where a
// screen sends someone assert on these.
export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/en",
  useSearchParams: () => new URLSearchParams(),
}));

// `next/image` renders a plain img in a test — the optimiser needs a server.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={typeof src === "string" ? src : ""} alt={alt} />;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
