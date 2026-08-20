// ═══════════════════════════════════════════════════════════════
// HOST MOUNTS — which subtree a hostname serves at its root
// ═══════════════════════════════════════════════════════════════
// Kept apart from proxy.ts so it can be tested without the edge runtime. The
// proxy imports next/server, which needs Web Request globals that a plain test
// environment does not have — and this is precisely the logic worth testing,
// because it fails silently.
//
// Generalised from smarthome-host.ts when the developer portal became the
// second subtree mounted this way. The exclusion rule below is the whole
// difficulty, and it was worth having one copy of rather than two that agree
// until somebody edits one.

export interface HostMount {
  /** Hostnames served by this subtree, anchored at both ends. */
  hosts: RegExp;
  /** The path prefix in this app that actually renders. */
  prefix: string;
  /**
   * The paths this subtree serves, relative to its prefix, when that set is
   * small and known. The prefix root is implied.
   *
   * Where this is given, a request for anything else on the hostname is sent
   * to the main site rather than rewritten into a page that cannot exist. The
   * console omits it because its route set is large and changes often; the
   * documentation portal is nine pages, and a parity test keeps this list
   * equal to the one the navigation is built from.
   */
  pages?: string[];
}

/**
 * The documentation portal's pages.
 *
 * Spelled out here rather than imported from `developer-docs.ts` on purpose:
 * this module is bundled into the edge proxy, and that one carries every code
 * sample in the documentation. `developer-docs-parity.test.ts` asserts the two
 * lists are equal, so the copy cannot drift.
 */
export const DEVELOPER_PAGES = [
  "quickstart",
  "authentication",
  "scopes",
  "endpoints",
  "commands",
  "browser",
  "webhooks",
  "errors",
  "limits",
];

/**
 * Every hostname mounted onto a subtree of this app.
 *
 * Each is anchored at both ends. Without the `$`,
 * `home.circuvent.com.attacker.net` is a host somebody else can own and would
 * be served our console on their origin.
 */
export const HOST_MOUNTS: HostMount[] = [
  { hosts: /^(home|iot)\.circuvent\.com$/i, prefix: "/smarthome" },
  { hosts: /^developer\.circuvent\.com$/i, prefix: "/developer", pages: DEVELOPER_PAGES },
  /*
   * Attendance is one page, and `pages: []` says so.
   *
   * The empty list is doing real work rather than being a placeholder: with it,
   * anything other than the root on this hostname redirects to the main site.
   * Without it, `attendance.circuvent.com/people` would rewrite to
   * `/smarthome/attendance/people`, which cannot exist — the console keeps its
   * sections in a `?tab=` query, not in the path. A 404 on a hostname somebody
   * typed by hand is worse than landing them on the site that does have the
   * page.
   *
   * It must also stay listed after the `home|iot` mount. `servedFromRoot`
   * excludes every prefix, so `/smarthome/attendance` is already served
   * unmapped on the main console — which is what keeps the existing
   * home.circuvent.com/smarthome/attendance address working unchanged.
   */
  { hosts: /^attendance\.circuvent\.com$/i, prefix: "/smarthome/attendance", pages: [] },
];

/**
 * Paths that mean the same thing on every hostname and must not be remapped.
 *
 * This list is the whole difficulty of mounting a subtree on a hostname. Miss
 * `/api` and all 148 API routes resolve to /smarthome/api/… — the console
 * renders its shell and then does nothing, with no error anywhere. Miss
 * `/_next` and every script and font 404s.
 *
 * Every mount prefix is excluded too: twelve files already link to
 * /smarthome/…, and remapping those would produce /smarthome/smarthome/rooms.
 * Leaving the prefixes alone means no link has to change on the day a
 * subdomain goes live, and a link written for the main site keeps working when
 * it is followed on the subdomain.
 */
export function servedFromRoot(pathname: string): boolean {
  if (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/.well-known/") ||
    // Anything that looks like a file: manifests, icons, the sitemap.
    /\.[a-z0-9]+$/i.test(pathname)
  ) {
    return true;
  }
  return HOST_MOUNTS.some(
    (m) => pathname === m.prefix || pathname.startsWith(`${m.prefix}/`)
  );
}

/** The path this request should actually render, or null to leave it alone. */
export function mountedPath(host: string, pathname: string): string | null {
  const name = (host ?? "").split(":")[0];
  const mount = HOST_MOUNTS.find((m) => m.hosts.test(name));
  if (!mount) return null;
  if (servedFromRoot(pathname)) return null;
  return `${mount.prefix}${pathname === "/" ? "" : pathname}`;
}

/** What the proxy should do with a request. */
export type MountAction =
  | { kind: "rewrite"; path: string }
  | { kind: "redirect"; url: string };

/**
 * How a request to a mounted hostname is served.
 *
 * A path the subtree does not have is **redirected to the main site**, not
 * rewritten. `developer.circuvent.com/domains` is a real address people
 * reached — the corporate nav rendered on the portal for a while and its links
 * pointed at corporate pages — and rewriting it produced `/developer/domains`,
 * which can only be a 404.
 *
 * Decided here rather than by a catch-all route, because a page that calls
 * `redirect()` has already begun streaming its layout: Next answers 200 with a
 * client-side hop instead of a 3xx, so the address bar stays put for anything
 * that is not a browser, and the shell flashes for anything that is.
 */
export function mountAction(host: string, pathname: string, mainSite: string): MountAction | null {
  const name = (host ?? "").split(":")[0];
  const mount = HOST_MOUNTS.find((m) => m.hosts.test(name));
  if (!mount) return null;
  if (servedFromRoot(pathname)) return null;

  if (mount.pages) {
    const slug = pathname === "/" ? "" : pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (slug && !mount.pages.includes(slug)) {
      return { kind: "redirect", url: `${mainSite}${pathname}` };
    }
  }

  return { kind: "rewrite", path: `${mount.prefix}${pathname === "/" ? "" : pathname}` };
}

/** Is this request being served as a mounted subtree's own site? */
export function isMountedHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.split(":")[0];
  return HOST_MOUNTS.some((m) => m.hosts.test(name));
}

/** The prefix this hostname serves, or null when it is the main site. */
export function mountPrefixFor(host: string | null | undefined): string | null {
  if (!host) return null;
  const name = host.split(":")[0];
  return HOST_MOUNTS.find((m) => m.hosts.test(name))?.prefix ?? null;
}
