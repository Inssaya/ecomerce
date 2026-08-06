import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // Photographs come from our own object storage and nowhere else.
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "minio", port: "9000", pathname: "/**" },
      { protocol: "https", hostname: "**.mostyle.ma", pathname: "/**" },
    ],
  },
  async rewrites() {
    const api =
      process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://api:8000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
  async redirects() {
    // Everything lives under a language. English is the default landing.
    return [{ source: "/", destination: "/en", permanent: false }];
  },
};

export default nextConfig;
