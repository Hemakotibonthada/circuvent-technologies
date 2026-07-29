// Edge proxy (Next.js file convention, formerly "middleware") — request
// correlation + Content-Security-Policy.
//
// A per-request X-Request-Id is generated and forwarded (downstream handlers
// echo it back via the api-handler wrapper) for traceability. The CSP itself
// lives in src/lib/csp.ts and is also declared in next.config.ts, so a route
// this matcher skips still receives the policy.

import { NextResponse, type NextRequest } from "next/server";
import { CSP } from "@/lib/csp";

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
