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
      // Local development: MinIO direct, and the same-origin /media proxy.
      { protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" },
      { protocol: "http", hostname: "localhost", port: "3000", pathname: "/**" },
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
    // Photographs, proxied on this origin.
    //
    // The shop hands out an absolute MinIO URL built from MINIO_PUBLIC_ENDPOINT.
    // A browser can fetch `localhost:9000`; the *server* cannot — inside the
    // container `localhost` is the container, so next/image's own fetch was
    // refused and every photograph on the site rendered as a broken icon.
    // Serving them from this origin fixes both readers at once, and is what
    // nginx already does in production.
    const media = process.env.INTERNAL_MEDIA_URL ?? "http://minio:9000";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/media/:path*", destination: `${media}/media/:path*` },
    ];
  },
  async redirects() {
    return [
      // Everything lives under a language. English is the default landing.
      { source: "/", destination: "/en", permanent: false },
      /*
       * The shop moved to the front door.
       *
       * `/store` and `/store/<line>` were a second index of the same pieces
       * and a route per category; both are the language root now, narrowed by
       * a query string. Permanent, because those URLs were public, sat in the
       * sitemap and were indexed — dropping them without a redirect throws
       * away whatever ranking they earned and 404s anyone with a bookmark.
       */
      { source: "/:lang(en|ar)/store", destination: "/:lang", permanent: true },
      {
        source: "/:lang(en|ar)/store/:category",
        destination: "/:lang?category=:category",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
