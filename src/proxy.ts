// Edge proxy (Next.js file convention, formerly "middleware") — request
// correlation + Content-Security-Policy.
//
// A per-request X-Request-Id is generated and forwarded (downstream handlers
// echo it back via the api-handler wrapper) for traceability. The CSP itself
// lives in src/lib/csp.ts and is also declared in next.config.ts, so a route
// this matcher skips still receives the policy.

import { NextResponse, type NextRequest } from "next/server";
import { CSP } from "@/lib/csp";
import { categorySlug } from "@/lib/shop-categories";
import { mountAction } from "@/lib/host-mounts";
import { SITE_URL } from "@/lib/config";

export function proxy(request: NextRequest) {
  /*
   * Subtrees mounted at the root of their own hostname — the smart home
   * console, and the developer portal.
   *
   * Done here rather than with a `rewrites()` entry because the exclusions are
   * the whole difficulty and they have to be readable. A bare catch-all sends
   * /api/devices to /smarthome/api/devices and every script to
   * /smarthome/_next/..., so all 148 API routes and every asset 404: the app
   * renders its shell and then does nothing, which is the hardest kind of
   * broken to diagnose. Expressing that as a negative lookahead inside a
   * path-to-regexp `source` is possible to write and impossible to trust — the
   * first attempt matched none of the three exclusions and was only caught by
   * requesting them.
   *
   * A path the portal does not serve is redirected to the main site here, at
   * the edge, where a real 3xx is still possible. A route that calls
   * `redirect()` has already started streaming its layout, so Next answers 200
   * with a client-side hop instead.
   */
  const action = mountAction(
    request.headers.get("host") ?? "",
    request.nextUrl.pathname,
    SITE_URL
  );
  if (action?.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = action.path;
    return NextResponse.rewrite(url);
  }
  if (action?.kind === "redirect") {
    const target = new URL(action.url);
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 307);
  }

  /*
   * Categories moved from /shop?cat=Safety to /shop/c/safety.
   *
   * Redirected permanently rather than left as a second working URL, so the
   * links and ranking signals already pointing at the query form end up on the
   * page that can actually rank. 308 keeps the method and tells crawlers this
   * is the canonical home.
   *
   * Only a lone category is redirected. A combined filter (?cat=A,B, or a
   * category alongside a price or sort) has no single destination, and sending
   * it to one category page would silently drop the rest of the shopper's
   * selection — those stay on /shop, where the grid applies them client-side
   * exactly as before.
   *
   * The slug is derived here without consulting the catalogue, which the edge
   * cannot read. A slug that matches no category lands on the category route's
   * own notFound() — the right answer for a category that does not exist.
   */
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/shop") {
    const cat = searchParams.get("cat");
    const onlyFilter = Array.from(searchParams.keys()).length === 1;
    if (cat && onlyFilter && !cat.includes(",")) {
      const slug = categorySlug(cat);
      if (slug) {
        const url = request.nextUrl.clone();
        url.pathname = `/shop/c/${slug}`;
        url.search = "";
        return NextResponse.redirect(url, 308);
      }
    }
  }

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
