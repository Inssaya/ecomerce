import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const STORE_SLUGS = ["clothes", "3dprint", "electronics", "glasses"];

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const url = request.nextUrl.clone();

  // Extract subdomain: clothes.mostyle.ma → "clothes"
  // Also handles local dev: clothes.localhost:3000 → "clothes"
  const parts = hostname.split(".");
  const isSubdomain =
    parts.length > 2 ||
    (parts.length === 2 && parts[1].startsWith("localhost"));

  if (isSubdomain) {
    const subdomain = parts[0].toLowerCase();
    if (STORE_SLUGS.includes(subdomain) && !url.pathname.startsWith("/store/")) {
      url.pathname = `/store/${subdomain}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
