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
  //
  // `.well-known/workflow/` is excluded because the Workflow SDK posts to its
  // own internal flow route to run and resume steps, and that request must
  // arrive untouched. A proxy that rewrites its headers detaches the request
  // body's ArrayBuffer, and the failure surfaces as
  // "[local world] Queue operation failed ... Cannot perform
  // ArrayBuffer.prototype.slice on a detached ArrayBuffer" — which names
  // neither this file nor the matcher, and reads like an SDK bug.
  //
  // The SDK's own guide calls this the easiest thing to miss on Next.js 16,
  // where proxy.ts replaced middleware.ts. Excluding the path costs nothing:
  // these are server-to-server calls that no browser makes, so they need
  // neither the request id nor the CSP.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|\\.well-known/workflow/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|map)).*)",
  ],
};
