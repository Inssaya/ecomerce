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
  /**
   * The headers nginx used to add.
   *
   * They lived in `infra/nginx/conf.d/mostyle.conf`, which is only in the
   * request path on a self-hosted deployment. Move the storefront to Vercel
   * and nginx is gone — along with every one of these, silently, because
   * nothing fails when a security header simply stops being sent.
   *
   * So they belong to the application rather than to one deployment of it.
   * Declared here they hold on Vercel, on a VPS behind nginx, and anywhere
   * else this app is ever run.
   *
   * Deliberately no Content-Security-Policy: a real one for this app has to
   * allow Supabase, R2 and Next's own inline bootstrap, and a CSP written
   * without testing each of those is a policy that either blocks sign-in or
   * is so loose it protects nothing. It is worth doing properly, separately.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // A browser that has seen this refuses plain HTTP for a year, so it
          // is only safe once the domain is confirmed working on HTTPS.
          // Vercel serves HTTPS on every domain it hosts, custom ones
          // included, so that condition is already met here.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // The shop is never framed by anyone, including itself. This is what
          // stops a copy being wrapped in someone else's page and the buyer
          // typing their address into it.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // A tracking token lives in the URL of the tracking page. Without
          // this it travels in the Referer header to every off-site link the
          // page carries — which is the whole credential for that order.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // An uploaded photograph must never be executed as script because a
          // browser guessed at its type.
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  async rewrites() {
    const api =
      process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://api:8000";
    // Photographs, proxied on this origin.
    //
    // Every stored file is `/media/<key>` in the database, and this is what
    // turns that into wherever the bytes actually live. Keeping it on this
    // origin serves both readers at once: the browser, and `next/image`'s own
    // server-side fetch, which cannot resolve a hostname that only means
    // something inside the storage network.
    //
    // `MEDIA_ORIGIN` is the base the object key hangs off, *including* any
    // bucket segment, because different providers put it in different places:
    //
    //   MinIO   http://minio:9000/media        (bucket in the path)
    //   R2      https://pub-<id>.r2.dev        (bucket is the hostname)
    //
    // Folding that difference into one variable is what lets the same build
    // run against either without the database knowing which.
    const media =
      process.env.MEDIA_ORIGIN ??
      `${process.env.INTERNAL_MEDIA_URL ?? "http://minio:9000"}/media`;
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/media/:path*", destination: `${media}/:path*` },
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
