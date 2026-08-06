import type { NextConfig } from "next";

/**
 * Where photographs are allowed to come from.
 *
 * Next refuses to load an image from a host that is not listed here, which is
 * the behaviour you want — but it means the media host is a deployment fact,
 * not a constant. It is rarely the site's own domain: object storage lives on
 * `something.r2.cloudflarestorage.com`, or a bucket subdomain, or MinIO in
 * Docker. Hard-coding one domain here is how a shop ends up live with every
 * product photo silently broken.
 *
 * `MEDIA_HOSTNAMES` is a comma-separated list, read at build time.
 * Wildcards are allowed, e.g. "photos.example.ma,**.r2.cloudflarestorage.com".
 */
const mediaHosts = (process.env.MEDIA_HOSTNAMES ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      // Local development: MinIO, by container name and from the host.
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "minio", port: "9000", pathname: "/**" },
      ...mediaHosts.map((hostname) => ({
        protocol: "https" as const,
        hostname,
        pathname: "/**",
      })),
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
