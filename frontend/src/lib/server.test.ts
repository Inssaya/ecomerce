/**
 * The line between a page that is gone and an API that blinked.
 *
 * `fromApi` and `resource` look almost the same and are deliberately not — one
 * hides every failure as null, the other lets you tell "the shop said no such
 * thing" apart from "we could not ask". That distinction is what stops a page
 * cached as a 404 the one minute the API was flaky. Worth pinning.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { alternates, fromApi, jsonLd, resource } from "./server";

describe("resource — the fetch a real page depends on", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => vi.unstubAllGlobals());

  const reply = (status: number, body: unknown = {}) =>
    fetchMock.mockResolvedValueOnce({
      ok: status < 400,
      status,
      json: async () => body,
    });

  it("returns the body when the shop answers", async () => {
    reply(200, { id: "1", slug: "hooks" });
    await expect(resource<{ slug: string }>("/categories/hooks", "en")).resolves.toEqual({
      id: "1",
      slug: "hooks",
    });
  });

  it("returns null on 404 — the caller passes that to notFound()", async () => {
    reply(404);
    await expect(resource("/categories/nope", "en")).resolves.toBeNull();
  });

  it("throws on any other failure, so a bad minute is not cached as gone", async () => {
    // If the shop is down we render the error page. If we returned null here,
    // notFound() would fire and Next would cache a 404 over a page that sells
    // something the moment the shop comes back.
    for (const status of [500, 502, 503, 504]) {
      reply(status);
      await expect(resource("/categories/hooks", "en")).rejects.toThrow(String(status));
    }
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(resource("/categories/hooks", "en")).rejects.toBeTruthy();
  });

  it("adds ?lang and joins & when the path already has a query", async () => {
    reply(200, {});
    await resource("/products?category=hooks", "en");
    expect(fetchMock.mock.calls[0][0]).toContain("/products?category=hooks&lang=en");
  });
});

describe("fromApi — the fetch a page is only enriched by", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => vi.unstubAllGlobals());

  it("collapses every failure to null — the sitemap still ships without products", async () => {
    // The sitemap, the landing counts, the store's first shelf. None of them
    // are worth a 500 to a person or to Google.
    for (const status of [404, 500, 503]) {
      fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({}) });
      await expect(fromApi("/products?size=1", "en")).resolves.toBeNull();
    }
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(fromApi("/products?size=1", "en")).resolves.toBeNull();
  });

  it("passes the visitor's language on both the query and the header", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await fromApi("/products", "ar");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("lang=ar");
    expect(new Headers(init.headers).get("accept-language")).toBe("ar");
  });
});

describe("hreflang alternates for a page", () => {
  it("names both languages and an x-default, all absolute", () => {
    const links = alternates("en", "/store/hooks");
    expect(links.canonical).toMatch(/\/en\/store\/hooks$/);
    expect(links.languages).toEqual({
      en: expect.stringMatching(/\/en\/store\/hooks$/),
      ar: expect.stringMatching(/\/ar\/store\/hooks$/),
      // x-default is what a search engine picks when it does not know the
      // visitor's language. Missing it is silently accepting the wrong pick.
      "x-default": expect.stringMatching(/\/en\/store\/hooks$/),
    });
  });
});

describe("jsonLd — the string that ends up in a <script>", () => {
  it("escapes the two characters that would end the tag or the script", () => {
    // `<` cannot be raw inside JSON-in-a-script — the browser sees </script>
    // and stops reading. U+2028 and U+2029 are ancient JavaScript SyntaxErrors
    // when unescaped in a string literal.
    const line = "\u2028", paragraph = "\u2029";
    const bad = jsonLd({ note: `hi </script>${line}${paragraph}` });
    expect(bad).not.toContain("</script>");
    expect(bad).not.toContain(line);
    expect(bad).not.toContain(paragraph);
    // And it stays valid JSON.
    expect(() => JSON.parse(bad)).not.toThrow();
  });
});
