import type { NextConfig } from "next";
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

export default nextConfig;
