// ═══════════════════════════════════════════════════════════════
// SMART HOME HOSTNAME — which requests are the console
// ═══════════════════════════════════════════════════════════════
// Kept apart from proxy.ts so it can be tested without the edge runtime. The
// proxy imports next/server, which needs Web Request globals that a plain test
// environment does not have — and this is precisely the logic worth testing,
// because it fails silently.

/**
 * Hostnames that serve the smart home console at their root.
 *
 * The console lives at /smarthome in this app and is mounted onto its own
 * subdomain rather than deployed a second time — one build, one source of
 * truth, nothing to drift. Both names are accepted so the subdomain can be
 * chosen with a DNS record alone.
 *
 * Anchored at both ends. Without the `$`, `home.circuvent.com.attacker.net` is
 * a host somebody else can own and would be served our console on their origin.
 */
export const HOME_HOSTS = /^(home|iot)\.circuvent\.com$/i;

/**
 * Paths that mean the same thing on every hostname and must not be remapped.
 *
 * This list is the whole difficulty of mounting a subtree on a hostname. Miss
 * `/api` and all 143 API routes resolve to /smarthome/api/… — the console
 * renders its shell and then does nothing, with no error anywhere. Miss
 * `/_next` and every script and font 404s.
 *
 * `/smarthome` is here too: twelve files already link to /smarthome/…, and
 * remapping those would produce /smarthome/smarthome/rooms. Leaving the prefix
 * alone means no link has to change on the day the subdomain goes live.
 */
export function servedFromRoot(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/smarthome" ||
    pathname.startsWith("/smarthome/") ||
    // Anything that looks like a file: manifests, icons, the sitemap.
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

/** The path this request should actually render, or null to leave it alone. */
export function smartHomePath(host: string, pathname: string): string | null {
  if (!HOME_HOSTS.test(host.split(":")[0])) return null;
  if (servedFromRoot(pathname)) return null;
  return `/smarthome${pathname === "/" ? "" : pathname}`;
}
