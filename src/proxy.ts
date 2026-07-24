// Edge proxy (Next.js file convention, formerly "middleware") — request
// correlation + Content-Security-Policy.
//
// A per-request X-Request-Id is generated and forwarded (downstream handlers
// echo it back via the api-handler wrapper) for traceability. A production-grade
// CSP is applied to document responses, allow-listing exactly the third parties
// the site actually uses (Razorpay payments, Vercel analytics, Firebase, Google
// Fonts, Cloudinary images). Static security headers (HSTS, X-Frame-Options, …)
// are set in next.config.ts so they also cover static assets.
//
// Note: 'unsafe-inline' is required for scripts because the app ships inline
// bootstrap scripts (theme, JSON-LD) and Next.js hydration payloads; everything
// else is tightly scoped.

import { NextResponse, type NextRequest } from "next/server";

const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    "https://checkout.razorpay.com",
    "https://va.vercel-scripts.com",
    "https://www.googletagmanager.com",
  ],
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "connect-src": [
    "'self'",
    "https://api.razorpay.com",
    "https://lumberjack.razorpay.com",
    "https://*.razorpay.com",
    "https://vitals.vercel-insights.com",
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "https://*.google-analytics.com",
    "wss://*.firebaseio.com",
  ],
  "frame-src": [
    "'self'",
    "https://api.razorpay.com",
    "https://checkout.razorpay.com",
    "https://*.razorpay.com",
  ],
  "worker-src": ["'self'", "blob:"],
  "manifest-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

function buildCsp(): string {
  const parts = Object.entries(CSP_DIRECTIVES).map(([k, v]) => `${k} ${v.join(" ")}`);
  parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

const CSP = buildCsp();

export function proxy(request: NextRequest) {
  const requestId =
    request.headers.get("x-request-id") || globalThis.crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  response.headers.set("Content-Security-Policy", CSP);
  return response;
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|map)).*)",
  ],
};
