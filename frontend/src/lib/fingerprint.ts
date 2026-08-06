const KEY = "_vid";

async function hash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
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
