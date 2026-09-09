const KEY = "_vid";

/**
 * A stable id for this browser.
 *
 * `crypto.subtle` exists only in a **secure context** — HTTPS, or `localhost`.
 * Served from a plain-HTTP origin that is not localhost (a phone opening
 * `http://192.168.0.x:3000` on the workshop's wifi, or any deployment not yet
 * behind TLS) it is `undefined`, and this threw.
 *
 * That failure was not contained here. `lib/api.ts` awaits this on *every*
 * request to attach `x-visitor-id`, so a throw meant no call was ever sent:
 * no sign-in, no cart, no products, no checkout. The shop rendered its static
 * shell and then did nothing at all, which is a very confusing way to
 * discover that the page needs HTTPS.
 *
 * So there is a fallback. It is FNV-1a — not a cryptographic hash and not
 * pretending to be one. That is acceptable because this value is not a
 * secret and guards nothing: it groups a browser's own signals for analytics
 * and rate limiting, and the server never trusts it for authority. A shop
 * that cannot be opened is worse than an id that is merely unique rather
 * than unguessable.
 */
async function hash(input: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  }

  // Two FNV-1a passes over the same input with different offsets, so the id
  // keeps the same 32-character shape the server and the console already
  // expect from the digest above.
  const fnv = (seed: number): string => {
    let h = seed;
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return (fnv(0x811c9dc5) + fnv(0x01000193) + fnv(0xdeadbeef) + fnv(0xcafebabe)).slice(0, 32);
}

function collect(): string {
  const parts: string[] = [
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? 0),
    String((navigator as { deviceMemory?: number }).deviceMemory ?? 0),
    navigator.platform ?? "",
    String(window.devicePixelRatio ?? 1),
  ];

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = 200;
      canvas.height = 50;
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(100, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("MoStyle👁", 2, 15);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.fillText("MoStyle👁", 4, 17);
      parts.push(canvas.toDataURL());
    }
  } catch {
    // canvas blocked
  }

  return parts.join("|");
}

let _cached: Promise<string> | null = null;

export function visitorId(): Promise<string> {
  if (_cached) return _cached;
  _cached = (async () => {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    const id = await hash(collect());
    localStorage.setItem(KEY, id);
    return id;
  })();
  return _cached;
}

/** The cookie the server also reads, so a server-rendered page sees the same
 *  visitor as the browser does. Set once, alongside the stored id. */
export async function ensureVisitorCookie(): Promise<string> {
  const id = await visitorId();
  document.cookie = `_vid=${id}; path=/; max-age=31536000; samesite=lax`;
  return id;
}
