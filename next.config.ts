import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { CSP } from "./src/lib/csp";

// Static security headers applied to every response. These follow OWASP
// secure-headers guidance. The CSP is repeated here (the edge proxy also sets
// it) so routes the proxy matcher skips are never served without a policy.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Vercel adds X-Robots-Tag automatically for *.vercel.app preview URLs, but not
// for a custom domain pointed at a branch — dev.circuvent.com would be indexed
// like production. robots.txt alone is not enough: a disallowed URL can still
// be indexed without being fetched, so send the header on every response too.
const isProductionDeploy =
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");

const robotsHeaders = isProductionDeploy
  ? []
  : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  /*
   * Let a build target its own directory.
   *
   * A dev server and a production build share .next, and the dev server keeps
   * rewriting it -- which silently deleted BUILD_ID twice while auditing, so
   * `next start` served nothing and the audit reported a clean sweep of an
   * empty site. Setting NEXT_DIST_DIR gives the audit build somewhere of its
   * own. Unset, nothing changes.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // ── Production hardening ──
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  // Tree-shake large barrel packages (icons/animation) to shrink client bundles.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Scoped to our own Cloudinary cloud: "/**" would turn the Next image
      // optimizer into an open proxy for every tenant on res.cloudinary.com.
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/djucuoojo/**" },
      { protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/**" },
    ],
  },

  async redirects() {
    return [
      {
        /*
         * Firmware moved out of the application bundle into R2.
         *
         * Eighteen images, about twenty megabytes, were committed under
         * `public/fw/` and shipped with every deployment — and a device
         * downloading one pulled it through this application's bandwidth.
         * They now live in a separate **public** bucket, because a device
         * doing an OTA check holds no credentials and cannot sign a request,
         * while the bucket holding resumes must never be public.
         *
         * The redirect keeps any URL already in the field working. Nothing in
         * the code ever hardcoded `/fw/...` — the OTA URL has always been
         * supplied by an operator — but a device flashed with one, or a
         * bookmark, would otherwise 404.
         */
        source: "/fw/:file",
        destination:
          "https://pub-d7f0dba2b9e5487092a2a1de50a12a2c.r2.dev/fw/:file",
        permanent: true,
      },
      {
        /*
         * The documentation moved to /developer and onto its own subdomain.
         *
         * Done here rather than with `permanentRedirect()` in the page,
         * because that page is statically prerendered: Next served a 200 shell
         * that only redirected once JavaScript ran. The API server publishes
         * this exact URL in its `/v1` index as `documentation`, so it is baked
         * into every client that has read the index — it needs to be a real
         * 308 that a crawler and a non-browser client both follow.
         */
        source: "/developers",
        destination: "/developer",
        permanent: true,
      },
      {
        source: "/developers/:path*",
        destination: "/developer/:path*",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders, ...robotsHeaders],
      },
      {
        // Long-lived immutable cache for build assets.
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // API responses must never be cached by shared caches.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

/*
 * withWorkflow enables the "use workflow" and "use step" directives, and
 * generates the SDK's internal route handlers under src/app/.well-known/workflow/
 * at build time.
 *
 * It wraps the config rather than replacing anything in it: every header, image
 * pattern and distDir rule above still applies.
 */
export default withWorkflow(nextConfig);
