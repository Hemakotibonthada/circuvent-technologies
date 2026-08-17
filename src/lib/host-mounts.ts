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
}

/**
 * Every hostname mounted onto a subtree of this app.
 *
 * Each is anchored at both ends. Without the `$`,
 * `home.circuvent.com.attacker.net` is a host somebody else can own and would
 * be served our console on their origin.
 */
export const HOST_MOUNTS: HostMount[] = [
  { hosts: /^(home|iot)\.circuvent\.com$/i, prefix: "/smarthome" },
  { hosts: /^developer\.circuvent\.com$/i, prefix: "/developer" },
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
